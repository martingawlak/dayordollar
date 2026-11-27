import { readdirSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Db, Stmt } from "../src/worker/inbox";

/** Builds the accounts database from its migrations (foreign keys on, like D1). */
export function migrate(sqlite: DatabaseSync) {
  sqlite.exec("pragma foreign_keys = on");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sqlite.exec(readFileSync(new URL(f, dir), "utf8"));
}

/** node:sqlite dressed as the D1 calls the Inbox uses. */
export function d1(sqlite: DatabaseSync): Db {
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => (sqlite.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => sqlite.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      sqlite.exec("begin");
      try {
        for (const s of stmts) await s.run();
        sqlite.exec("commit");
      } catch (e) {
        sqlite.exec("rollback");
        throw e;
      }
    },
  };
}

