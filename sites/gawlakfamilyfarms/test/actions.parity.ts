/**
 * The buttons and forms: each request must answer and change the stored
 * state exactly as the plugin's handler does. A list of steps (who sends
 * what, with which form fields; see test/action-php.php for the kinds) is
 * replayed through the plugin (MariaDB) and the Worker (SQLite) from the
 * same fixture. After every step the reply, the mail sent (with its
 * headers) and the stored state — users and their roles, gff_* user meta
 * with first/last name, gff_* settings, transients — must match.
 *
 * Run: npx tsx test/actions.parity.ts [filter]
 */
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { STEPS, handler, type Step } from "./actions.steps";
import { ACTIONS, POSTS } from "../src/actions";
import { maybeHandleSubmit } from "../src/forms/express";
import { makeCtx, setMeta, setOpt } from "../src/ctx";
import { JOBS } from "../src/jobs";
import { adminStep, optionsStep } from "./actions.steps.admin";
import type { AjaxCtx } from "../src/ajax";
import type { DatabaseSync } from "node:sqlite";

const filter = process.argv[2] ?? "";
const steps: Step[] = STEPS.filter((s) => !filter || s.action.includes(filter) || (s.tag ?? "").includes(filter));
Date.now = () => NOW * 1000;

/** Settings the Worker reads from its secrets instead: an @option step sets both. */
const SECRET_OPTIONS: Record<string, string> = { gff_google_geocode_key: "GOOGLE_GEOCODE_KEY" };
const SKIP_OPTIONS = new Set(["gff_google_geocode_key", "gff_dbk_sa_json"]);

/** Arrays as compact JSON (as the PHP side prints them), everything else as text. */
const canon = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[\[{]/.test(s)) return s;
  try { return JSON.stringify(JSON.parse(s)); } catch { return s; }
};

/** The Worker's state in the PHP side's shape. */
function snapshot(db: DatabaseSync): unknown {
  const rows = (sql: string) => db.prepare(sql).all() as Record<string, any>[];
  return {
    users: rows("select id, login, email, display_name, registered, roles from wp_users order by id")
      .map((r) => [String(r.id), r.login, r.email, r.display_name, r.registered, JSON.stringify(JSON.parse(r.roles || "[]"))]),
    usermeta: rows("select user_id, meta_key, meta_value from wp_usermeta where meta_key like 'gff\\_%' escape '\\' or meta_key in ('first_name', 'last_name') order by user_id, meta_key collate binary")
      .map((r) => [String(r.user_id), r.meta_key, canon(r.meta_value)]),
    options: rows("select option_name, option_value from wp_options where option_name like 'gff\\_%' escape '\\' order by option_name collate binary")
      .filter((r) => !SKIP_OPTIONS.has(String(r.option_name)))
      .map((r) => [r.option_name, canon(r.option_value)]),
    transients: rows("select name, value from transients order by name collate binary")
      .map((r) => { const v = JSON.parse(String(r.value)); return [r.name, typeof v === "string" ? v : JSON.stringify(v)]; }),
  };
}

const phpS = handler();
const tsS = handler();
const phpWorld = await fakeServer(phpS.handle);
const tsWorld = await fakeServer(tsS.handle);

const phpOut = await php<{ reply: any; mail: any[]; state: any }[]>("action-php.php", {
  now: NOW, rpc: phpWorld.base, steps: steps.map((s) => ({ uid: s.uid, action: s.action, post: s.post ?? {}, get: s.get ?? {}, referer: s.referer, workerOnly: s.workerOnly, expect: s.expect })),
});

routeFetch(tsWorld.base);
const db = freshDb();
const env = testEnv(db);
let failed = 0;
for (const [i, s] of steps.entries()) {
  const ctx = await makeCtx(env, s.uid, "/", NOW);
  const ac: AjaxCtx = Object.assign(ctx, { post: s.post ?? {}, get: s.get ?? {}, ip: "127.0.0.1", files: {}, referer: s.referer ?? "", later: (fn: () => Promise<unknown>) => { void fn(); } });
  // wp_generate_password()'s stand-in sequence (test/wp.php), restarting with each request as on the PHP side.
  let pwN = 0;
  (globalThis as any).__gffRandomCode = (len: number) => ("R" + String(++pwN).padStart(4, "0")).repeat(10).slice(0, len);
  env.MAIL_LOG!.length = 0;
  let tsReply: unknown;
  if (s.action.startsWith("@option")) {
    for (const [k, v] of Object.entries(s.post ?? {})) {
      const val = String(v);
      await setOpt(ctx, k, /^[\[{]/.test(val) ? JSON.parse(val) : val);
      if (SECRET_OPTIONS[k]) (env as any)[SECRET_OPTIONS[k]] = val;
    }
    tsReply = { die: "" };
  } else if (s.action.startsWith("@meta")) {
    for (const [k, v] of Object.entries(s.post ?? {})) { const val = String(v); await setMeta(ctx, s.uid, k, /^[\[{]/.test(val) ? JSON.parse(val) : val); }
    tsReply = { die: "" };
  } else if (s.action.startsWith("@job:")) {
    const job = JOBS[s.action.slice(5)];
    if (!job) throw new Error("no Worker job for " + s.action);
    await job(ctx);
    tsReply = { die: "" };
  } else if (s.action === "@options") {
    tsReply = await optionsStep(ac);
  } else if (s.action.startsWith("@admin:")) {
    tsReply = await adminStep(ac, s.action.slice(7));
  } else if (s.action === "@page") {
    await maybeHandleSubmit(ac);
    tsReply = { notice: ac.reg.notice, repop: ac.reg.repop, old: ac.reg.old };
  } else {
    const isPost = s.action.startsWith("@post:");
    const a = isPost ? POSTS[s.action.slice(6)] : ACTIONS[s.action];
    const h = a ? (s.uid ? a.priv : a.nopriv) : undefined;
    const reply = h ? await h(ac) : { body: isPost ? "" : "0", status: 200 };
    const body = (reply as any).body;
    const status = (reply as any).status;
    tsReply = typeof body === "string" ? { die: body } : { ...(body as object), ...(status !== 200 ? { __status: status } : {}) };
  }
  const p = phpOut[i];
  const want = JSON.stringify({ reply: p.reply, mail: p.mail, state: p.state });
  const got = JSON.stringify({ reply: tsReply, mail: env.MAIL_LOG, state: snapshot(db) });
  const d = firstDiff(want, got);
  const label = `${i} ${s.action} u${s.uid}${s.tag ? " [" + s.tag + "]" : ""}`;
  if (d) { failed++; console.log(`✗ ${label}\n  ${d}`); } else console.log(`✓ ${label}`);
}
phpWorld.close(); tsWorld.close();
console.log(`\n${steps.length - failed} of ${steps.length} steps match`);
process.exit(failed ? 1 : 0);
