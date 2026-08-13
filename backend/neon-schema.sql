CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
  barcode TEXT UNIQUE, image_path TEXT, source_url TEXT, catalog_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory (
  product_id BIGINT NOT NULL REFERENCES products(id),
  location TEXT NOT NULL CHECK(location IN ('FACTORY','PICKING')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  PRIMARY KEY(product_id,location)
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'ADMIN' CHECK(role IN ('ADMIN','STAFF','VIEWER')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS movements (
  id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id), type TEXT NOT NULL,
  from_location TEXT, to_location TEXT, quantity INTEGER NOT NULL CHECK(quantity > 0),
  worker_id BIGINT REFERENCES users(id), memo TEXT NOT NULL DEFAULT '', vendor_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS vendor_name TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, memo TEXT NOT NULL DEFAULT '',
  factory_address TEXT NOT NULL DEFAULT '', delivery_address TEXT NOT NULL DEFAULT '',
  vendor_type TEXT NOT NULL DEFAULT 'SALES' CHECK(vendor_type IN ('FACTORY','SALES')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS factory_address TEXT NOT NULL DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_type TEXT NOT NULL DEFAULT 'SALES';
CREATE TABLE IF NOT EXISTS factory_orders (
  id BIGSERIAL PRIMARY KEY, vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK(status IN ('ORDERED','RECEIVED','CANCELLED')),
  factory_address TEXT NOT NULL DEFAULT '', delivery_address TEXT NOT NULL DEFAULT '', memo TEXT NOT NULL DEFAULT '',
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), received_at TIMESTAMPTZ, created_by BIGINT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS factory_order_items (
  id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES factory_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE TABLE IF NOT EXISTS product_aliases (
  id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL, normalized_alias TEXT NOT NULL UNIQUE, source TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS label_templates (
  id BIGSERIAL PRIMARY KEY, vendor TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', product_name TEXT NOT NULL,
  barcode TEXT, source_path TEXT NOT NULL UNIQUE, product_id BIGINT REFERENCES products(id), template_data JSONB
);
CREATE TABLE IF NOT EXISTS label_vendors (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_imports (
  id BIGSERIAL PRIMARY KEY, vendor TEXT NOT NULL, filename TEXT NOT NULL, file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW', raw_text TEXT NOT NULL DEFAULT '', source_path TEXT NOT NULL DEFAULT '',
  preview_pdf_path TEXT NOT NULL DEFAULT '', reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_imports ADD COLUMN IF NOT EXISTS source_path TEXT NOT NULL DEFAULT '';
ALTER TABLE order_imports ADD COLUMN IF NOT EXISTS preview_pdf_path TEXT NOT NULL DEFAULT '';
ALTER TABLE order_imports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS order_import_items (
  id BIGSERIAL PRIMARY KEY, import_id BIGINT NOT NULL REFERENCES order_imports(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
  matched_product_id BIGINT REFERENCES products(id), confidence DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_movements_product_created ON movements(product_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_import ON order_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_labels_vendor_product ON label_templates(vendor,product_name);
