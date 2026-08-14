import { Pool, types } from "pg";

types.setTypeParser(20, (value) => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1 });

try {
  const before = await pool.query(`
    SELECT location,
           COUNT(*) FILTER (WHERE quantity <> 0)::int AS nonzero_rows,
           COALESCE(SUM(quantity), 0)::bigint AS total
    FROM inventory
    GROUP BY location
    ORDER BY location
  `);

  await pool.query("BEGIN");
  await pool.query("UPDATE inventory SET quantity = 0 WHERE quantity <> 0");
  await pool.query("COMMIT");

  const after = await pool.query(`
    SELECT location,
           COUNT(*) FILTER (WHERE quantity <> 0)::int AS nonzero_rows,
           COALESCE(SUM(quantity), 0)::bigint AS total
    FROM inventory
    GROUP BY location
    ORDER BY location
  `);
  const barcodeAudit = await pool.query(`
    SELECT
      COUNT(*)::int AS active_products,
      COUNT(*) FILTER (WHERE barcode IS NULL OR BTRIM(barcode) = '')::int AS missing_barcodes,
      COUNT(*) FILTER (WHERE barcode IS NOT NULL AND BTRIM(barcode) <> ''
        AND barcode !~ '^[0-9]+$')::int AS non_numeric_barcodes,
      COUNT(*) FILTER (WHERE barcode IS NOT NULL AND BTRIM(barcode) <> ''
        AND LENGTH(BTRIM(barcode)) NOT BETWEEN 8 AND 14)::int AS unusual_lengths
    FROM products
    WHERE active = TRUE
  `);
  const duplicates = await pool.query(`
    SELECT barcode, COUNT(*)::int AS count,
           STRING_AGG(name || CASE WHEN color = '' THEN '' ELSE ' ' || color END, ' / ' ORDER BY name) AS products
    FROM products
    WHERE active = TRUE AND barcode IS NOT NULL AND BTRIM(barcode) <> ''
    GROUP BY barcode
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, barcode
  `);

  console.log(JSON.stringify({ before: before.rows, after: after.rows, barcode: barcodeAudit.rows[0], duplicates: duplicates.rows }, null, 2));
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}
