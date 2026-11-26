/**
 * Every rendered piece of the page, one plugin function at a time: the same
 * expression evaluated by the plugin (test/fn-php.php, MariaDB) and by the
 * Worker's port (SQLite), from the same fixture, must give the same bytes.
 * The enqueued app script and its ZLP_CFG settings must match too.
 *
 * Run: npx tsx test/render.parity.ts [filter]
 */
import { CASES, type Case } from "./render.cases";
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { makeCtx, setMeta, setOpt } from "../src/ctx";

const filter = process.argv[2] ?? "";
const server = await fakeServer();
routeFetch(server.base);
Date.now = () => NOW * 1000;

let failed = 0;
let passed = 0;
for (const c of CASES.filter((x: Case) => !filter || x.name.includes(filter))) {
  const p = await php<{ out: string[]; scripts: Record<string, unknown>; localized: Record<string, unknown> }>("fn-php.php", {
    now: NOW, rpc: server.base, uid: c.uid ?? 0, permalink: c.permalink ?? "/", exprs: c.php, options: c.options ?? {}, meta: c.meta ?? [],
  });
  const db = freshDb();
  const ctx = await makeCtx(testEnv(db), c.uid ?? 0, c.permalink ?? "/", NOW);
  for (const [k, v] of Object.entries(c.options ?? {})) await setOpt(ctx, k, v);
  for (const [u, k, v] of c.meta ?? []) await setMeta(ctx, u, k, v);
  const outs: string[] = [];
  for (const f of c.ts) outs.push(await f(ctx));
  let bad = "";
  outs.forEach((o, i) => { const d = firstDiff(p.out[i], o); if (d && !bad) bad = `${c.php[i]}: ${d}`; });
  if (!bad && c.checkScripts) {
    const tsScripts = Object.fromEntries(ctx.scripts.map((s) => [s.handle, { src: s.src, ver: s.ver }]));
    const tsLoc: Record<string, unknown> = {};
    for (const l of ctx.localized) (tsLoc[l.handle] ??= {} as any)[l.name] = l.data;
    const d = firstDiff(JSON.stringify(p.scripts) + JSON.stringify(p.localized), JSON.stringify(tsScripts) + JSON.stringify(tsLoc));
    if (d) bad = "enqueued scripts: " + d;
  }
  if (bad) { failed++; console.log(`✗ ${c.name}\n  ${bad}`); } else { passed++; console.log(`✓ ${c.name}`); }
}
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
