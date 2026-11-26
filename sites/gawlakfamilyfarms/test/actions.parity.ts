/**
 * The buttons: each AJAX action must answer and change the stored state
 * exactly as the plugin's handler does. A list of steps (who presses what,
 * with which form fields) is replayed through the plugin (test/action-php.php,
 * MariaDB) and the Worker (src/actions, SQLite) from the same fixture. After
 * every step the reply (and its HTTP status), the mail sent, every
 * transaction signed and sent to the chain, and the plugin's tables, user
 * meta, settings and transients must match.
 *
 * Each side gets its own fake chain (same answers, fresh state), so the
 * transactions each one sends can be compared.
 *
 * Run: npx tsx test/actions.parity.ts [filter]
 */
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { STEPS, chainHandler, type Step } from "./actions.steps";
import { ACTIONS } from "../src/actions";
import { adminHtml } from "../src/routes/admin";
import { normaliseAdmin } from "./actions.steps.admin";
import { makeCtx, setMeta, setOpt } from "../src/ctx";
import { JOBS } from "../src/jobs";
import type { AjaxCtx } from "../src/ajax";
import type { DatabaseSync } from "node:sqlite";

const filter = process.argv[2] ?? "";
const steps: Step[] = STEPS.filter((s) => !filter || s.action.includes(filter) || (s.tag ?? "").includes(filter));
Date.now = () => NOW * 1000;

/** Options the Worker reads from its secrets instead: an @option step sets both. */
const SECRET_OPTIONS: Record<string, string> = { dodz_merch_key: "MERCH_KEY", dodz_pp_secret: "PAYPAL_SECRET", dodz_pf_token: "PRINTFUL_TOKEN", dodz_gift_key: "GIFT_KEY", dodz_buyback_key: "BUYBACK_KEY" };

const SKIP_OPTIONS = new Set(["dodz_gift_key", "dodz_buyback_key", "dodz_merch_key", "dodz_api_key", "dodz_pf_token", "dodz_pp_secret", "dodz_gdrive_client_secret"]);

/** Arrays as compact JSON (as the PHP side prints them), everything else as text. */
const canon = (v: unknown) => { const s = String(v ?? ""); return /^[\[{]/.test(s) ? JSON.stringify(JSON.parse(s)) : s; };

/** The Worker's state in the PHP side's shape. */
function snapshot(db: DatabaseSync): unknown {
  const str = (v: unknown) => (v === null || v === undefined ? null : typeof v === "number" && !Number.isInteger(v) ? String(v) : String(v));
  const rows = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];
  const out: Record<string, unknown> = {};
  for (const t of ["dodz_gifts", "dodz_commissions"]) {
    out[t] = rows(`select * from ${t} order by id`).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])));
  }
  out.usermeta = rows("select user_id, meta_key, meta_value from wp_usermeta where meta_key like 'gff\\_%' escape '\\' order by user_id, meta_key collate binary")
    .map((r) => [String(r.user_id), r.meta_key, canon(r.meta_value)]);
  out.options = rows("select option_name, option_value from wp_options where option_name like 'gff\\_%' escape '\\' order by option_name collate binary")
    .filter((r) => !SKIP_OPTIONS.has(String(r.option_name)) && !String(r.option_name).startsWith("dodz_addr_"))
    .map((r) => [r.option_name, canon(r.option_value)]);
  out.transients = rows("select name, value from transients order by name collate binary")
    .filter((r) => !/^dodz_([0-9a-f]{32}$|bal_|ethusd_)/.test(String(r.name)))
    .map((r) => [r.name, typeof r.value === "string" && /^[\[{]/.test(r.value) ? r.value : JSON.parse(String(r.value))]).map(([n, v]) => [n, typeof v === "string" ? v : JSON.stringify(v)]);
  return out;
}

/** Fields that differ by design between MySQL and the Worker (see MIGRATION.md): when a row was written. */
function normalise(state: any): any {
  for (const t of ["dodz_gifts", "dodz_commissions"]) for (const r of state[t] ?? []) { r.created = ""; }
  // usd is DECIMAL(10,2) in MySQL ("100.00") and REAL in D1 (100): compare it to the cent.
  for (const r of state.dodz_commissions ?? []) if (r.usd !== null && r.usd !== undefined) r.usd = Number(r.usd).toFixed(2);
  return state;
}

const phpC = chainHandler();
const tsC = chainHandler();
const phpChain = await fakeServer(phpC.handle);
const tsChain = await fakeServer(tsC.handle);

const phpOut = await php<{ reply: any; mail: any[]; state: any }[]>("action-php.php", {
  now: NOW, rpc: phpChain.base, steps: steps.map((s) => ({ uid: s.uid, action: s.action, post: s.post ?? {}, get: s.get ?? {}, workerOnly: s.workerOnly, expect: s.expect })),
});

routeFetch(tsChain.base);
const db = freshDb();
const env = testEnv(db);
let failed = 0;
for (const [i, s] of steps.entries()) {
  const ctx = await makeCtx(env, s.uid, "/", NOW);
  const ac: AjaxCtx = Object.assign(ctx, { post: s.post ?? {}, get: s.get ?? {}, ip: "127.0.0.1", files: {}, later: (fn: () => Promise<unknown>) => { void fn(); } });
  env.MAIL_LOG!.length = 0;
  let reply: { body: unknown; status: number };
  if (s.action.startsWith("@option")) {
    for (const [k, v] of Object.entries(s.post ?? {})) await setOpt(ctx, k, /^[\[{]/.test(v) ? JSON.parse(v) : v);
    // Settings that are Worker secrets: the plugin read them from wp_options.
    for (const [k, e] of Object.entries(SECRET_OPTIONS)) if (s.post && k in s.post) (env as any)[e] = s.post[k];
    reply = { body: "", status: 200 };
  } else if (s.action.startsWith("@meta")) {
    for (const [k, v] of Object.entries(s.post ?? {})) await setMeta(ctx, s.uid, k, /^[\[{]/.test(v) ? JSON.parse(v) : v);
    reply = { body: "", status: 200 };
  } else if (s.action.startsWith("@job:")) {
    const job = JOBS[s.action.slice(5)];
    if (!job) throw new Error("no Worker job for " + s.action);
    await job(ctx);
    reply = { body: "", status: 200 };
  } else if (s.action.startsWith("@admin")) {
    // Settings → DayorDollar (src/routes/admin.ts), posted as the step's user.
    reply = { body: { html: await adminHtml(ac) }, status: 200 };
  } else {
    const a = ACTIONS[s.action];
    const h = a ? (s.uid ? a.priv : a.nopriv) : undefined;
    reply = h ? await h(ac) : { body: "0", status: 200 };
  }
  const body = (reply as any).body;
  const status = (reply as any).status;
  const tsReply = typeof body === "string" ? { die: body } : { ...(body as object), ...(status !== 200 ? { __status: status } : {}) };
  const p = phpOut[i];
  if (s.action.startsWith("@admin")) { p.reply.html = normaliseAdmin(p.reply.html ?? ""); (tsReply as any).html = normaliseAdmin((tsReply as any).html ?? ""); }
  const want = JSON.stringify({ reply: p.reply, mail: p.mail, state: normalise(p.state) });
  const got = JSON.stringify({ reply: tsReply, mail: env.MAIL_LOG, state: normalise(snapshot(db)) });
  const d = firstDiff(want, got);
  const label = `${i} ${s.action} u${s.uid}${s.tag ? " [" + s.tag + "]" : ""}`;
  if (d) { failed++; console.log(`✗ ${label}\n  ${d}`); } else console.log(`✓ ${label}`);
}
const sentDiff = firstDiff(JSON.stringify(phpC.sent), JSON.stringify(tsC.sent));
if (sentDiff) { failed++; console.log(`✗ transactions sent to the chain differ\n  ${sentDiff}`); }
else console.log(`✓ ${phpC.sent.length} transactions sent, identical`);
phpChain.close(); tsChain.close();
console.log(`\n${steps.length - failed} of ${steps.length} steps match`);
process.exit(failed ? 1 : 0);
