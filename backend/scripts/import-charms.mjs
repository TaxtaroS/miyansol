import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';

const groups = [
  { idx: 307, sku: 'WEB-307', names: [...Array.from({length:11},(_,i)=>`꽃참${i+1}`), ...Array.from({length:3},(_,i)=>`꽃키참${i+1}`)], images: ['9c5f4675ea732','e00e7ded505c8','04cf3b389b74c','32722bbdf49b5','d5aab63180276','edd4d8937826b','56e048d193c3e','75fdf8b01c997','b3796df51bb28','9b1d0599b080a','dc3079fc48ca7','8360326d037de','57e3fcf9dfba5','9c5f4675ea732'] },
  { idx: 308, sku: 'WEB-308', names: Array.from({length:4},(_,i)=>`하트참${i+1}`), images: ['764ebafac971d','4d125f26f4e0c','d3397ca3ae28a','059e1f6b1c033'] },
  { idx: 303, sku: 'WEB-303', names: Array.from({length:19},(_,i)=>`구슬${i+1}`), images: ['8c9a34e96427b','5a7e2ad21b68b','ef50a8e3cbb8e','5dee79af01dda','c24324f65ccbf','dfc7f7794e9af','be04bc8429751','d84429037f1b0','5afd686f5796e','3308d0578d517','8fee24c67dcc0'] },
  { idx: 305, sku: 'WEB-305', names: Array.from({length:18},(_,i)=>`미니구슬${i+1}`), images: ['38e24553c5f9f','2eb3ce62dbaad','eb6d52ab0ad5e','1e85c4a604415','30cd48e863ff9','281f0c1590d37','fb3b7194ace03','ea8ebeb66aada','7c5d172ed1e80','873618a9302b6'] },
  { idx: 309, sku: 'WEB-309', names: Array.from({length:6},(_,i)=>`로프${i+1}`), images: ['a03158dc3eabf','39b974ed6d222','ada93a9f58768','00ebb1136003a','5966dcaa43ceb','0a3c6d202b6ad'] },
  { idx: 374, sku: 'WEB-374', names: Array.from({length:7},(_,i)=>`털실폼폼${i+1}`), images: ['a4b757e670805','26b2ed98ad943','4cb3ab393a250','5ceeb0cceb552','509dff1615b74','2699d5a46ea82','8fdaf6ca8034d'] },
  { idx: 405, sku: 'WEB-405', names: Array.from({length:8},(_,i)=>`솔참${i+1}`), images: ['be81d845ee995','e18f7c94f5644','f7de3c94453d9','ae1bea0ecf522','71ce1e30ccb7b','46ffbbb1f16da','e0652d2ab9a29','8775a545d34b8'] },
];

const uploadDir = path.resolve('uploads/products');
await fs.mkdir(uploadDir, { recursive: true });
for (const group of groups) {
  for (let i = 0; i < group.names.length; i++) {
    const file = `${group.idx}-${i + 1}.jpg`;
    const image = group.images[i % group.images.length];
    const response = await fetch(`https://cdn-optimized.imweb.me/upload/S202504254a3ceb726b697/${image}.jpg`);
    if (!response.ok) throw new Error(`${group.names[i]} 사진 다운로드 실패: ${response.status}`);
    await fs.writeFile(path.join(uploadDir, file), Buffer.from(await response.arrayBuffer()));
  }
}

const db = new Database('data/inventory.db');
const upsert = db.prepare('INSERT INTO products(sku,name,color,active,image_path,source_url,catalog_name) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,color=excluded.color,active=1,image_path=excluded.image_path,source_url=excluded.source_url,catalog_name=excluded.catalog_name');
const update = db.prepare('UPDATE products SET name=?,catalog_name=?,image_path=?,source_url=?,active=1 WHERE sku=?');
const inventory = db.prepare('INSERT OR IGNORE INTO inventory(product_id,location,quantity) VALUES(?,?,0)');
db.transaction(() => {
  for (const group of groups) {
    const source = `https://miyansol.com/acc/?idx=${group.idx}`;
    for (let i = 0; i < group.names.length; i++) {
      const sku = i === 0 ? group.sku : `${group.sku}-${i + 1}`;
      const imagePath = `/uploads/products/${group.idx}-${i + 1}.jpg`;
      if (i === 0) update.run(group.names[i], group.names[i], imagePath, source, sku);
      else upsert.run(sku, group.names[i], '', 1, imagePath, source, group.names[i]);
      const row = db.prepare('SELECT id FROM products WHERE sku=?').get(sku);
      inventory.run(row.id, 'FACTORY');
      inventory.run(row.id, 'PICKING');
    }
  }
})();
console.log(groups.map(group => `${group.idx}: ${group.names.length}개`).join('\n'));
db.close();
