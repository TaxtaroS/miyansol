import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';

const colors = ['그레이', '블루', '블랙', '스카이', '오렌지', '올리브', '와인', '카멜'];
const images = [
  '52e41f7249858',
  '202cf654a0c41',
  '75f7bbd48e95a',
  '4676d573db4a6',
  'f88bd974b4659',
  '8fcfc80880f56',
  '342d758aa7ed0',
  '3c558ac130a42',
];
const uploadDir = path.resolve('uploads/products');
await fs.mkdir(uploadDir, { recursive: true });

for (let index = 0; index < colors.length; index++) {
  const response = await fetch(`https://cdn-optimized.imweb.me/upload/S202504254a3ceb726b697/${images[index]}.jpg?w=1200`);
  if (!response.ok) throw new Error(`${colors[index]} 사진 다운로드 실패: ${response.status}`);
  await fs.writeFile(path.join(uploadDir, `351-${index + 1}.jpg`), Buffer.from(await response.arrayBuffer()));
}

const db = new Database('data/inventory.db');
const sourceUrl = 'https://miyansol.com/strap/?idx=351';
const update = db.prepare('UPDATE products SET name=?,catalog_name=?,image_path=?,source_url=?,active=1 WHERE sku=?');
const upsert = db.prepare('INSERT INTO products(sku,name,color,active,image_path,source_url,catalog_name) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,color=excluded.color,active=1,image_path=excluded.image_path,source_url=excluded.source_url,catalog_name=excluded.catalog_name');
const inventory = db.prepare('INSERT OR IGNORE INTO inventory(product_id,location,quantity) VALUES(?,?,0)');
const findProduct = db.prepare('SELECT id FROM products WHERE sku=?');

db.transaction(() => {
  colors.forEach((color, index) => {
    const sku = index === 0 ? 'WEB-351' : `WEB-351-${index + 1}`;
    const name = `로프 스트랩 ${color}`;
    const imagePath = `/uploads/products/351-${index + 1}.jpg`;
    if (index === 0) update.run(name, name, imagePath, sourceUrl, sku);
    else upsert.run(sku, name, color, 1, imagePath, sourceUrl, name);
    const product = findProduct.get(sku);
    inventory.run(product.id, 'FACTORY');
    inventory.run(product.id, 'PICKING');
  });
})();

db.close();
console.log(`로프 스트랩 ${colors.length}종 등록 완료`);
