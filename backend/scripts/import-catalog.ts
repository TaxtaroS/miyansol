import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
const imageDir = path.join(root, 'uploads', 'products');
fs.mkdirSync(imageDir, { recursive: true });
const db = new Database(path.join(dataDir, 'inventory.db'));
for (const column of ['image_path','source_url','catalog_name']) {
  const columns = db.prepare('PRAGMA table_info(products)').all() as {name:string}[];
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT`);
}
const names: string[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'inventory-names.json'), 'utf8'));
const normalize = (value: string) => value.toLowerCase().replace(/미야앤솔|miyansol|[^가-힣a-z0-9]/g, '');
const candidates = names.map(name => ({ name, key: normalize(name) })).filter(x => x.key.length > 1).sort((a,b) => b.key.length-a.key.length);
const decode = (value: string) => value.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
const meta = (html:string, property:string) => decode((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i')))?.[1] || '');

const sitemap = await (await fetch('https://miyansol.com/sitemap.xml')).text();
const urls = [...sitemap.matchAll(/<loc>(https:\/\/miyansol\.com\/shop_view\/(\d+))<\/loc>/g)].map(m => ({url:m[1], id:m[2]}));
const unique = [...new Map(urls.map(x => [x.id,x])).values()];
console.log(`사이트 상품 ${unique.length}개를 확인했습니다.`);
for (let index=0; index<unique.length; index+=6) {
  await Promise.all(unique.slice(index,index+6).map(async item => {
    try {
      const html = await (await fetch(item.url, {headers:{'User-Agent':'Mozilla/5.0'}})).text();
      const title = meta(html,'og:title').replace(/\s*:\s*미야앤솔\s*$/,'').trim();
      const imageUrl = meta(html,'og:image');
      if (!title || title === '미야앤솔') return;
      const matched = candidates.find(candidate => normalize(title).includes(candidate.key));
      let imagePath: string|null = null;
      if (imageUrl) {
        const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
        const filename = `${item.id}${['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)?ext:'.jpg'}`;
        fs.writeFileSync(path.join(imageDir, filename), Buffer.from(await (await fetch(imageUrl)).arrayBuffer()));
        imagePath = `/uploads/products/${filename}`;
      }
      const result = db.prepare(`INSERT INTO products(sku,name,color,barcode,image_path,source_url,catalog_name) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,image_path=excluded.image_path,source_url=excluded.source_url,catalog_name=excluded.catalog_name RETURNING id`).get(`WEB-${item.id}`,title,'',null,imagePath,item.url,matched?.name||null) as {id:number};
      db.prepare("INSERT OR IGNORE INTO inventory(product_id,location,quantity) VALUES(?,'FACTORY',0),(?,'PICKING',0)").run(result.id,result.id);
    } catch (error) { console.error(`상품 ${item.id} 실패`, error instanceof Error ? error.message : error); }
  }));
  console.log(`${Math.min(index+6,unique.length)}/${unique.length}`);
}
const totals = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN catalog_name IS NOT NULL THEN 1 ELSE 0 END) matched FROM products WHERE sku LIKE 'WEB-%'`).get() as {total:number,matched:number};
console.log(`등록 ${totals.total}개 / 품목표 매칭 ${totals.matched}개 / 미매칭 ${totals.total-totals.matched}개`);
