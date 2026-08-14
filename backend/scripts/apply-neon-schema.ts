import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = fs.readFileSync(path.join(root, "neon-schema.sql"), "utf8");
const pool = new Pool({ connectionString, max: 1 });

try {
  await pool.query(schema);
  console.log("Neon schema is up to date.");
} finally {
  await pool.end();
}
