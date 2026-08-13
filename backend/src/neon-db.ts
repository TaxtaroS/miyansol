import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types, type PoolClient, type QueryResult } from "pg";

types.setTypeParser(20, (value) => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL 설정이 필요합니다.");

const pool = new Pool({ connectionString, max: 5 });
const transactionClient = new AsyncLocalStorage<PoolClient>();

function convertSql(source: string) {
  let index = 0;
  return source
    .replace(/\?/g, () => `$${++index}`)
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .replace(/\bactive\s*=\s*1\b/gi, "active=TRUE")
    .replace(/\bactive\s*=\s*0\b/gi, "active=FALSE")
    .replace(
      /datetime\(m\.created_at\)>=datetime\('now','-7 days'\)/gi,
      "m.created_at >= NOW() - INTERVAL '7 days'",
    )
    .replace(
      /datetime\(m\.created_at\)>=datetime\('now','-30 days'\)/gi,
      "m.created_at >= NOW() - INTERVAL '30 days'",
    )
    .replace(
      /GROUP_CONCAT\(DISTINCT\s+([^\)]+)\)/gi,
      "STRING_AGG(DISTINCT $1::text, ',')",
    )
    .replace(/\bMAX\(([^,()]+),\s*([^()]+)\)/gi, "GREATEST($1,$2)")
    .replace(/\bMIN\(([^,()]+),\s*([^()]+)\)/gi, "LEAST($1,$2)");
}

async function execute(sql: string, values: unknown[]): Promise<QueryResult> {
  const client = transactionClient.getStore();
  return client
    ? client.query(convertSql(sql), values)
    : pool.query(convertSql(sql), values);
}

class Statement {
  constructor(private readonly sql: string) {}
  async get(...values: unknown[]) {
    return (await execute(this.sql, values)).rows[0];
  }
  async all(...values: unknown[]) {
    return (await execute(this.sql, values)).rows;
  }
  async run(...values: unknown[]) {
    let sql = this.sql.trim();
    if (
      /^INSERT\s/i.test(sql) &&
      !/^INSERT\s+INTO\s+inventory\b/i.test(sql) &&
      !/\bRETURNING\b/i.test(sql)
    )
      sql += " RETURNING id";
    const result = await execute(sql, values);
    return {
      changes: result.rowCount || 0,
      lastInsertRowid: result.rows[0]?.id,
    };
  }
}

export const db = {
  prepare(sql: string) {
    return new Statement(sql);
  },
  transaction<TArgs extends unknown[], TResult>(
    work: (...args: TArgs) => Promise<TResult>,
  ) {
    return async (...args: TArgs) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await transactionClient.run(client, () => work(...args));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
  },
  async close() {
    await pool.end();
  },
};
