/**
 * D1 caps queries per request (1,000 measured on Workers Free, 50 in the docs;
 * a batch counts as one).
 * Every Inbox operation must stay far below that however full the Inbox is.
 * Run: npx tsx test/query-budget.test.ts
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Inbox, type Db } from "../src/worker/inbox";
import { d1, migrate } from "./sqlite";

const sqlite = new DatabaseSync(":memory:");
migrate(sqlite);
const add = sqlite.prepare(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 1, '2026-01-01', '2026-01-01')`);
add.run("me", "Me", "me@example.com");
for (let i = 0; i < 150; i++) add.run(`p${i}`, `Person ${i}`, `p${i}@example.com`);
let queries = 0;
const real = d1(sqlite);
const counted: Db = {
  prepare: (sql) => real.prepare(sql),
  batch: async (s) => { queries++; return real.batch(s); },
};
// Count each statement run outside a batch.
const wrap = (db: Db): Db => ({
  batch: counted.batch,
  prepare: (sql) => {
    const st = db.prepare(sql);
    const w = (x: ReturnType<Db["prepare"]>): ReturnType<Db["prepare"]> => ({
      bind: (...v) => w(x.bind(...v)),
      first: () => { queries++; return x.first(); },
      all: () => { queries++; return x.all(); },
      run: () => { queries++; return x.run(); },
    });
    return w(st);
  },
});
let clock = Date.parse("2026-11-28T12:00:00Z");
const inbox = new Inbox({ db: wrap(real), now: () => (clock += 1000), notify: async () => {} });
// A full Inbox: 150 people wrote to me, I'm connected with most.
for (let i = 0; i < 150; i++) {
  await inbox.send(`p${i}`, "mgc", { email: "me@example.com", body: `hello ${i}` });
  if (i % 3) await inbox.answer("me", `p${i}`, "accept");
  clock += 25 * 60 * 60 * 1000;
}
const budget: Record<string, number> = {};
const measure = async (name: string, fn: () => Promise<unknown>) => { queries = 0; await fn(); budget[name] = queries; };
await measure("summary", () => inbox.summary("me"));
await measure("counts", () => inbox.counts("me"));
await measure("connections", () => inbox.connections("me"));
await measure("links", () => inbox.links("me"));
await measure("thread", () => inbox.thread("me", "p1"));
await measure("send (connected)", () => inbox.send("me", "mgc", { to: "p1", body: "hi" }));
await measure("send (new, by email)", () => inbox.send("p0", "mgc", { email: "p149@example.com", body: "hi" }));
await measure("answer", () => inbox.answer("me", "p3", "block"));
await measure("settings", () => inbox.settings("me", { name: "Me Too", notify: true }));
await measure("link", () => inbox.link("me", "p0"));
console.log(budget);
for (const [name, n] of Object.entries(budget)) assert.ok(n <= 15, `${name} uses ${n} queries`);
console.log("query budget: every operation stays within 15 queries");
