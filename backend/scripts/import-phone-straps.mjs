import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';

const names = Array.from({ length: 8 }, (_, index) => `H·P 스트랩${index + 1}`);
const images = [
  '11bf38bfae2b3',
  '9ea9b7cf56cb3',
  'c73eb24e6b9f2',
  '42fd8aadb4563',
  'abc00aa6d13ad',
  '91d0baccf3fce',
  '6dfb31db53109',
  'd4210337f7d43',
];
const uploadDir = path.resolve('uploads/products');
await fs.mkdir(uploadDir, { recursive: true });

for (let index = 0; index < names.length; index++) {
  const response = await fetch(`https://cdn-optimized.imweb.me/upload/S202504254a3ceb726b697/${images[index]}.jpg?w=1200`);
  if (!response.ok) throw new Error(`${names[index]} 사진 다운로드 실패: ${response.status}`);
  await fs.writeFile(path.join(uploadDir, `320-${index + 1}.jpg`), Buffer.from(await response.arrayBuffer()));
}

const db = new Database('data/inventory.db');
const sourceUrl = 'https://miyansol.com/strap/?idx=320';
const update = db.prepare('UPDATE products SET name=?,catalog_name=?,image_path=?,source_url=?,active=1 WHERE sku=?');
const upsert = db.prepare('INSERT INTO products(sku,name,color,active,image_path,source_url,catalog_name) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,color=excluded.color,active=1,image_path=excluded.image_path,source_url=excluded.source_url,catalog_name=excluded.catalog_name');
const inventory = db.prepare('INSERT OR IGNORE INTO inventory(product_id,location,quantity) VALUES(?,?,0)');
const findProduct = db.prepare('SELECT id FROM products WHERE sku=?');

db.transaction(() => {
  names.forEach((name, index) => {
    const sku = index === 0 ? 'WEB-320' : `WEB-320-${index + 1}`;
    const imagePath = `/uploads/products/320-${index + 1}.jpg`;
    if (index === 0) update.run(name, name, imagePath, sourceUrl, sku);
    else upsert.run(sku, name, '', 1, imagePath, sourceUrl, name);
    const product = findProduct.get(sku);
    inventory.run(product.id, 'FACTORY');
    inventory.run(product.id, 'PICKING');
  });
})();

db.close();
console.log(`핸드폰 스트랩 ${names.length}종 등록 완료`);
