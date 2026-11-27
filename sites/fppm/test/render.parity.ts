/**
 * Every rendered piece, one plugin function at a time: the same expression
 * evaluated by the plugin (test/fn-php.php on the stand-in WordPress,
 * MariaDB) and by the Worker's port (SQLite), from the same fixture, at the
 * same clock, must give the same bytes.
 *
 * Run: npx tsx test/render.parity.ts [filter]
 */
import { CASES, type Case } from "./render.cases";
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { fakeWorld } from "./fakes";
import { makeCtx, setMeta, setOpt } from "../src/ctx";

const filter = process.argv[2] ?? "";
const world = fakeWorld();
const server = await fakeServer(world.handle);
routeFetch(server.base);

let failed = 0, passed = 0;
for (const c of CASES.filter((x: Case) => !filter || x.name.includes(filter))) {
  const now = c.now ?? NOW;
  Date.now = () => now * 1000;
  const p = await php<{ out: string[] }>("fn-php.php", {
    now, rpc: server.base, uid: c.uid ?? 0, uri: c.uri ?? "/", get: c.get ?? {}, exprs: c.php, options: c.options ?? {}, meta: c.meta ?? [], users: c.users ?? [],
    ...(c.queried !== undefined ? { queried: c.queried } : {}),
  });
  const db = freshDb();
  for (const [id, login, role] of c.users ?? []) db.prepare("insert into wp_users (id, login, email, display_name, registered, roles) values (?, ?, ?, ?, ?, ?)").run(id, login, login + "@example.test", login, "2026-11-01 00:00:00", JSON.stringify([role]));
  const env = testEnv(db, c.env ?? {});
  const ctx = await makeCtx(env, c.uid ?? 0, c.uri ?? "/", now);
  ctx.get = c.get ?? {};
  for (const [k, v] of Object.entries(c.options ?? {})) await setOpt(ctx, k, v);
  for (const [u, k, v] of c.meta ?? []) await setMeta(ctx, u, k, v);
  const outs: string[] = [];
  for (const f of c.ts) outs.push(await f(ctx));
  let bad = "";
  // A documented intended difference (MIGRATION.md) rewrites the plugin's output first, at exactly that spot.
  if (c.intended) p.out = p.out.map((o) => c.intended!(o, ctx));
  outs.forEach((o, i) => { const d = firstDiff(p.out[i], o); if (d && !bad) bad = `${c.php[i]}: ${d}`; });
  if (bad) { failed++; console.log(`✗ ${c.name}\n  ${bad}`); } else { passed++; console.log(`✓ ${c.name}`); }
}
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
