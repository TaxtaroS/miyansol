import Database from "better-sqlite3";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Neon의 DATABASE_URL을 먼저 설정해 주세요.");

const sqlite = new Database(path.join(root, "data", "inventory.db"), {
  readonly: true,
});
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
const schema = fs.readFileSync(path.join(root, "neon-schema.sql"), "utf8");

const tables: [string, string[]][] = [
  [
    "products",
    [
      "id",
      "sku",
      "name",
      "color",
      "active",
      "barcode",
      "image_path",
      "source_url",
      "catalog_name",
      "created_at",
    ],
  ],
  [
    "users",
    [
      "id",
      "email",
      "name",
      "password_hash",
      "role",
      "active",
      "created_at",
      "last_login_at",
    ],
  ],
  ["inventory", ["product_id", "location", "quantity"]],
  [
    "vendors",
    [
      "id",
      "name",
      "memo",
      "factory_address",
      "delivery_address",
      "vendor_type",
      "active",
      "created_at",
    ],
  ],
  [
    "factory_orders",
    [
      "id",
      "vendor_id",
      "status",
      "factory_address",
      "delivery_address",
      "memo",
      "ordered_at",
      "received_at",
      "created_by",
    ],
  ],
  ["factory_order_items", ["id", "order_id", "product_id", "quantity"]],
  [
    "product_aliases",
    ["id", "product_id", "alias", "normalized_alias", "source", "created_at"],
  ],
  [
    "label_templates",
    [
      "id",
      "vendor",
      "category",
      "product_name",
      "barcode",
      "source_path",
      "product_id",
      "template_data",
    ],
  ],
  ["label_vendors", ["id", "name", "active", "created_at"]],
  [
    "order_imports",
    [
      "id",
      "vendor",
      "filename",
      "file_type",
      "status",
      "raw_text",
      "source_path",
      "preview_pdf_path",
      "reviewed_at",
      "created_at",
    ],
  ],
  [
    "order_import_items",
    [
      "id",
      "import_id",
      "source_name",
      "quantity",
      "matched_product_id",
      "confidence",
    ],
  ],
  [
    "movements",
    [
      "id",
      "product_id",
      "type",
      "from_location",
      "to_location",
      "quantity",
      "worker_id",
      "memo",
      "vendor_name",
      "created_at",
    ],
  ],
];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(schema);
  for (const [table, columns] of tables) {
    const rows = sqlite
      .prepare(`SELECT ${columns.join(",")} FROM ${table}`)
      .all() as Record<string, unknown>[];
    for (let start = 0; start < rows.length; start += 200) {
      const chunk = rows.slice(start, start + 200);
      const values: unknown[] = [];
      const tuples = chunk.map(
        (row, rowIndex) =>
          `(${columns
            .map((column, columnIndex) => {
              values.push(
                column === "active" ? Boolean(row[column]) : row[column],
              );
              return `$${rowIndex * columns.length + columnIndex + 1}`;
            })
            .join(",")})`,
      );
      await client.query(
        `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
        values,
      );
    }
    console.log(`${table}: ${rows.length}개 이전`);
  }
  for (const table of [
    "products",
    "users",
    "vendors",
    "factory_orders",
    "factory_order_items",
    "product_aliases",
    "label_templates",
    "label_vendors",
    "order_imports",
    "order_import_items",
    "movements",
  ]) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}','id'),COALESCE((SELECT MAX(id) FROM ${table}),1),true)`,
    );
  }
  await client.query("COMMIT");
  console.log("Neon 데이터 이전이 완료되었습니다.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
  sqlite.close();
}
