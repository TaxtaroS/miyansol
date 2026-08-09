import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(path.join(dataDir, 'inventory.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory (
  product_id INTEGER NOT NULL,
  location TEXT NOT NULL CHECK(location IN ('FACTORY','PICKING')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  PRIMARY KEY(product_id, location),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  from_location TEXT,
  to_location TEXT,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  worker_id INTEGER,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS label_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  barcode TEXT,
  source_path TEXT NOT NULL UNIQUE,
  product_id INTEGER,
  template_data TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS order_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW',
  raw_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_import_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  source_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  matched_product_id INTEGER,
  confidence REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(import_id) REFERENCES order_imports(id) ON DELETE CASCADE,
  FOREIGN KEY(matched_product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  memo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const labelColumns = db.prepare('PRAGMA table_info(label_templates)').all() as { name: string }[];
if (!labelColumns.some((column) => column.name === 'template_data')) db.exec('ALTER TABLE label_templates ADD COLUMN template_data TEXT');

const productColumns = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
if (!productColumns.some((column) => column.name === 'barcode')) {
  db.exec('ALTER TABLE products ADD COLUMN barcode TEXT');
}
if (!productColumns.some((column) => column.name === 'image_path')) db.exec('ALTER TABLE products ADD COLUMN image_path TEXT');
if (!productColumns.some((column) => column.name === 'source_url')) db.exec('ALTER TABLE products ADD COLUMN source_url TEXT');
if (!productColumns.some((column) => column.name === 'catalog_name')) db.exec('ALTER TABLE products ADD COLUMN catalog_name TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL');

db.exec(`INSERT OR IGNORE INTO inventory(product_id, location, quantity) SELECT id, 'FACTORY', 0 FROM products;
INSERT OR IGNORE INTO inventory(product_id, location, quantity) SELECT id, 'PICKING', 0 FROM products;
INSERT OR IGNORE INTO vendors(name) SELECT DISTINCT vendor FROM label_templates WHERE TRIM(vendor)!='';
INSERT OR IGNORE INTO vendors(name) SELECT DISTINCT vendor FROM order_imports WHERE TRIM(vendor)!='';`);

// Sellmate's own MIYANSOL barcode is the default label source.
db.prepare("UPDATE products SET barcode=? WHERE id=(SELECT id FROM products WHERE name IN ('로프1','로프참1') ORDER BY CASE WHEN name='로프1' THEN 0 ELSE 1 END LIMIT 1) AND (barcode IS NULL OR barcode='')").run('8800359722859');
db.prepare(`INSERT OR IGNORE INTO label_templates(vendor,category,product_name,barcode,source_path,product_id,template_data)
  SELECT '셀메이트','로프참',name,'8800359722859',?,id,?
  FROM products WHERE name IN ('로프1','로프참1')
  ORDER BY CASE WHEN name='로프1' THEN 0 ELSE 1 END LIMIT 1`).run(
    'C:\\Users\\USER\\Downloads\\sellmate_custom_pdf_20260807_174736.pdf',
    JSON.stringify(['MSRP0001','Rope Charm 1'])
  );
db.prepare("UPDATE label_templates SET vendor='셀메이트' WHERE vendor='셀메이트 기본'").run();
db.prepare("UPDATE vendors SET active=0 WHERE name='셀메이트 기본'").run();
db.prepare("INSERT OR IGNORE INTO vendors(name,memo) VALUES('셀메이트','MIYANSOL 기본 바코드')").run();
db.prepare("UPDATE label_templates SET category='플라워키' WHERE category IN ('꽃키','키참') OR template_data LIKE '%MSFK%' OR template_data LIKE '%키모양%'").run();
