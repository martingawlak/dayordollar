/**
 * Every rendered piece of the page, one plugin function at a time: the same
 * expression evaluated by the plugin (test/fn-php.php, MariaDB) and by the
 * Worker's port (SQLite), from the same fixture, must give the same bytes.
 * With checkAssets, what the request enqueued (scripts, styles, their inline
 * code and localized data) must match too.
 *
 * Run: npx tsx test/render.parity.ts [filter]
 */
import { CASES, type Case } from "./render.cases";
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { makeCtx, setMeta, setOpt } from "../src/ctx";
import { aerialHandler } from "./aerial.fake";

const filter = process.argv[2] ?? "";
const server = await fakeServer(aerialHandler);
routeFetch(server.base);
Date.now = () => NOW * 1000;

let failed = 0;
let passed = 0;
for (const c of CASES.filter((x: Case) => !filter || x.name.includes(filter))) {
  const p = await php<{ out: string[]; assets: Record<string, unknown> }>("fn-php.php", {
    now: NOW, rpc: server.base, uid: c.uid ?? 0, permalink: c.permalink ?? "/", exprs: c.php, options: c.options ?? {}, meta: c.meta ?? [],
  });
  const db = freshDb();
  const ctx = await makeCtx(testEnv(db), c.uid ?? 0, c.permalink ?? "/", NOW);
  for (const [k, v] of Object.entries(c.options ?? {})) await setOpt(ctx, k, v);
  for (const [u, k, v] of c.meta ?? []) await setMeta(ctx, u, k, v);
  const outs: string[] = [];
  for (const f of c.ts) outs.push(await f(ctx));
  let bad = "";
  // A documented intended difference (MIGRATION.md) rewrites the plugin's output first, at exactly that spot.
  if (c.intended) p.out = p.out.map((o) => c.intended!(o));
  outs.forEach((o, i) => { const d = firstDiff(p.out[i], o); if (d && !bad) bad = `${c.php[i]}: ${d}`; });
  if (!bad && c.checkAssets) {
    const d = firstDiff(JSON.stringify(p.assets), JSON.stringify(ctx.assets));
    if (d) bad = "enqueued assets: " + d;
  }
  if (bad) { failed++; console.log(`✗ ${c.name}\n  ${bad}`); } else { passed++; console.log(`✓ ${c.name}`); }
}
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
