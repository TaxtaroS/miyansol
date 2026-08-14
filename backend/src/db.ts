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
CREATE TABLE IF NOT EXISTS label_vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  factory_address TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL DEFAULT '',
  vendor_type TEXT NOT NULL DEFAULT 'SALES' CHECK(vendor_type IN ('FACTORY','SALES')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK(role IN ('ADMIN','STAFF','VIEWER')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS factory_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK(status IN ('ORDERED','RECEIVED','CANCELLED')),
  factory_address TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  ordered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TEXT,
  created_by INTEGER,
  FOREIGN KEY(vendor_id) REFERENCES vendors(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS factory_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  FOREIGN KEY(order_id) REFERENCES factory_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS product_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
`);

const labelColumns = db.prepare('PRAGMA table_info(label_templates)').all() as { name: string }[];
if (!labelColumns.some((column) => column.name === 'template_data')) db.exec('ALTER TABLE label_templates ADD COLUMN template_data TEXT');

const movementColumns = db.prepare('PRAGMA table_info(movements)').all() as { name: string }[];
if (!movementColumns.some((column) => column.name === 'vendor_name')) db.exec("ALTER TABLE movements ADD COLUMN vendor_name TEXT NOT NULL DEFAULT ''");

const orderImportColumns = db.prepare('PRAGMA table_info(order_imports)').all() as { name: string }[];
if (!orderImportColumns.some((column) => column.name === 'source_path')) db.exec("ALTER TABLE order_imports ADD COLUMN source_path TEXT NOT NULL DEFAULT ''");
if (!orderImportColumns.some((column) => column.name === 'preview_pdf_path')) db.exec("ALTER TABLE order_imports ADD COLUMN preview_pdf_path TEXT NOT NULL DEFAULT ''");
if (!orderImportColumns.some((column) => column.name === 'reviewed_at')) db.exec("ALTER TABLE order_imports ADD COLUMN reviewed_at TEXT");
if (!orderImportColumns.some((column) => column.name === 'file_data')) db.exec("ALTER TABLE order_imports ADD COLUMN file_data BLOB");

const productColumns = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
if (!productColumns.some((column) => column.name === 'barcode')) {
  db.exec('ALTER TABLE products ADD COLUMN barcode TEXT');
}
if (!productColumns.some((column) => column.name === 'image_path')) db.exec('ALTER TABLE products ADD COLUMN image_path TEXT');
if (!productColumns.some((column) => column.name === 'source_url')) db.exec('ALTER TABLE products ADD COLUMN source_url TEXT');
if (!productColumns.some((column) => column.name === 'catalog_name')) db.exec('ALTER TABLE products ADD COLUMN catalog_name TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL');

const vendorColumns = db.prepare('PRAGMA table_info(vendors)').all() as { name: string }[];
if (!vendorColumns.some((column) => column.name === 'factory_address')) db.exec("ALTER TABLE vendors ADD COLUMN factory_address TEXT NOT NULL DEFAULT ''");
if (!vendorColumns.some((column) => column.name === 'delivery_address')) db.exec("ALTER TABLE vendors ADD COLUMN delivery_address TEXT NOT NULL DEFAULT ''");
if (!vendorColumns.some((column) => column.name === 'vendor_type')) db.exec("ALTER TABLE vendors ADD COLUMN vendor_type TEXT NOT NULL DEFAULT 'SALES'");

db.exec(`INSERT OR IGNORE INTO inventory(product_id, location, quantity) SELECT id, 'FACTORY', 0 FROM products;
INSERT OR IGNORE INTO inventory(product_id, location, quantity) SELECT id, 'PICKING', 0 FROM products;
INSERT OR IGNORE INTO vendors(name) SELECT DISTINCT vendor FROM label_templates WHERE TRIM(vendor)!='';
INSERT OR IGNORE INTO vendors(name) SELECT DISTINCT vendor FROM order_imports WHERE TRIM(vendor)!='';`);
db.prepare("INSERT OR IGNORE INTO label_vendors(name) SELECT DISTINCT vendor FROM label_templates WHERE TRIM(vendor)!=''").run();

// Sellmate's own MIYANSOL barcode is the default label source.
db.prepare("UPDATE products SET barcode=? WHERE id=(SELECT id FROM products WHERE name IN ('로프1','로프참1') ORDER BY CASE WHEN name='로프1' THEN 0 ELSE 1 END LIMIT 1) AND (barcode IS NULL OR barcode='')").run('8800359722859');
db.prepare(`INSERT OR IGNORE INTO label_templates(vendor,category,product_name,barcode,source_path,product_id,template_data)
  SELECT '셀메이트','로프참',name,'8800359722859',?,id,?
  FROM products WHERE name IN ('로프1','로프참1')
    AND NOT EXISTS (SELECT 1 FROM label_templates WHERE vendor='셀메이트' AND source_path LIKE '%stk_forInOut%')
  ORDER BY CASE WHEN name='로프1' THEN 0 ELSE 1 END LIMIT 1`).run(
    'C:\\Users\\USER\\Downloads\\sellmate_custom_pdf_20260807_174736.pdf',
    JSON.stringify(['MSRP0001','Rope Charm 1'])
  );
db.prepare("UPDATE label_templates SET vendor='셀메이트' WHERE vendor='셀메이트 기본'").run();
db.prepare("UPDATE vendors SET active=0 WHERE name='셀메이트 기본'").run();
db.prepare("INSERT OR IGNORE INTO vendors(name,memo) VALUES('셀메이트','MIYANSOL 기본 바코드')").run();
db.prepare("UPDATE label_templates SET category='플라워키' WHERE category IN ('꽃키','키참') OR template_data LIKE '%MSFK%' OR template_data LIKE '%키모양%'").run();
for (const row of db.prepare("SELECT id,product_name FROM label_templates WHERE vendor='신세계_온라인_명동점_인천공항_라벨' AND category='멍미참'").all() as Array<{id:number;product_name:string}>) {
  const number=Number(row.product_name.match(/\d+/)?.[0]||0);
  if(number) db.prepare('UPDATE label_templates SET template_data=? WHERE id=?').run(JSON.stringify([`멍미 참 No ${number}`,`MSMM${String(number).padStart(4,'0')}`]),row.id);
}
db.prepare("DELETE FROM label_templates WHERE vendor='신세계온라인 샘플라벨' AND category='멍미참'").run();
