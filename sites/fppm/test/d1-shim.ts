/** Enough of Cloudflare's D1 API over node:sqlite to run the Worker's queries in tests. */
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) { return new Stmt(this.db, this.sql, args.map((a) => (typeof a === "boolean" ? Number(a) : a))); }
  private st() { return this.db.prepare(this.sql); }
  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    const r = this.st().get(...(this.args as any[])) as any;
    return r === undefined ? null : col ? r[col] : { ...r };
  }
  async all<T = Record<string, unknown>>() { return { results: (this.st().all(...(this.args as any[])) as any[]).map((r) => ({ ...r })) as T[], success: true, meta: {} }; }
  async run() { const r = this.st().run(...(this.args as any[])); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; }
}

export function d1(db: DatabaseSync): D1Database {
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => Promise.all(stmts.map((s) => s.all())),
    exec: async (sql: string) => { db.exec(sql); return { count: 0, duration: 0 }; },
  } as unknown as D1Database;
}
