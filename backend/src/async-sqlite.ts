import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";

// The HTTP API awaits every query. Keep one connection exclusively owned until
// an async transaction finishes, including across awaits and failed requests.
export function createAsyncSqliteDatabase(connection: Database.Database) {
  const owner = new AsyncLocalStorage<{ active: boolean }>();
  let queue: Promise<unknown> = Promise.resolve();
  function schedule<T>(work: () => T | Promise<T>): Promise<T> {
    if (owner.getStore()?.active) return Promise.resolve().then(work);
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    prepare(sql: string) {
      return {
        get: (...values: unknown[]) => schedule(() => connection.prepare(sql).get(...values)),
        all: (...values: unknown[]) => schedule(() => connection.prepare(sql).all(...values)),
        run: (...values: unknown[]) => schedule(() => connection.prepare(sql).run(...values)),
      };
    },
    transaction<TArgs extends unknown[], TResult>(work: (...args: TArgs) => Promise<TResult>) {
      return (...args: TArgs) => schedule(async () => {
        if (owner.getStore()?.active) throw new Error("중첩 트랜잭션은 지원하지 않습니다.");
        const context = { active: true };
        connection.exec("BEGIN IMMEDIATE");
        try {
          const result = await owner.run(context, () => work(...args));
          connection.exec("COMMIT");
          return result;
        } catch (error) {
          connection.exec("ROLLBACK");
          throw error;
        } finally {
          context.active = false;
        }
      });
    },
    close: () => schedule(() => connection.close()),
  };
}
