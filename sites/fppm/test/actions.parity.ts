/**
 * The buttons and forms: each request must answer and change the stored
 * state exactly as the plugin's handler does. The steps (test/actions.steps.ts)
 * are replayed through the plugin (test/action-php.php on MariaDB) and the
 * Worker (SQLite) from the same fixture. After every step the reply, the
 * mail sent and the stored state — users and their roles, fppm_* user meta
 * with first/last name, fppm_* and gff_dbk_* settings, transients — must
 * match; at the end, every request each side sent to PayPal, Printful and
 * Google must be identical.
 *
 * Intended differences, applied to the plugin's side at exactly their spot:
 *  - the join form has no password: the plugin is sent one (it refused
 *    fewer than 8 characters), and it is left out of the refilled values;
 *  - a new member is sent to the accounts sign-in instead of being signed in
 *    (the plugin's redirect to /account/?fppm_note=registered becomes
 *    /auth/login?returnTo=<that page>);
 *  - the settings page's three credential rows (test/render.cases.ts SECRET_ROWS).
 *
 * Run: npx tsx test/actions.parity.ts [filter]
 */
import { fakeServer, firstDiff, freshDb, NOW, php, routeFetch, testEnv } from "./harness";
import { fakeWorld } from "./fakes";
import { STEPS, type Step } from "./actions.steps";
import { AJAX, POSTS } from "../src/actions";
import { decode, loginUrl, makeCtx, setMeta, setOpt } from "../src/ctx";
import { JOBS } from "../src/jobs";
import { maybeHandleRegister } from "../src/fppm/register";
import { dbkSettingsPage, saveSettings, settingsPage, SECRET_ROWS, secretRow } from "../src/fppm/settings";
import { waiversPage } from "../src/fppm/waivers";
import { die, type AjaxCtx } from "../src/ajax";
import type { DatabaseSync } from "node:sqlite";

const filter = process.argv[2] ?? "";
const steps: Step[] = STEPS.filter((s) => !filter || s.action.includes(filter) || (s.tag ?? "").includes(filter));
Date.now = () => NOW * 1000;

/** Settings the Worker reads from its secrets instead: an @option step sets both. */
const SECRET_OPTIONS: Record<string, "GOOGLE_SA_JSON" | "PAYPAL_SECRET" | "PRINTFUL_TOKEN"> = { fppm_gs_json: "GOOGLE_SA_JSON", fppm_pp_secret: "PAYPAL_SECRET", fppm_printful_token: "PRINTFUL_TOKEN" };

/** [kind, text] of a stored value, as the PHP side reports it; arrays compared as parsed JSON. */
const kv = (raw: string | null): [string, string] => { const v = decode(raw); return v !== null && typeof v === "object" ? ["a", JSON.stringify(v)] : ["s", String(v ?? "")]; };
const canonKv = (x: [string, string]): [string, string] => (x[0] === "a" ? ["a", JSON.stringify(JSON.parse(x[1]))] : x);

function snapshot(db: DatabaseSync): unknown {
  const rows = (sql: string) => db.prepare(sql).all() as Record<string, any>[];
  return {
    users: rows("select id, login, email, display_name, registered, roles from wp_users order by id")
      .map((r) => [String(r.id), r.login, r.email, r.display_name, r.registered, JSON.stringify(JSON.parse(r.roles || "[]"))]),
    usermeta: rows("select user_id, meta_key, meta_value from wp_usermeta where meta_key like 'fppm\\_%' escape '\\' or meta_key in ('first_name', 'last_name') order by user_id, meta_key collate binary")
      .map((r) => [String(r.user_id), r.meta_key, kv(r.meta_value)]),
    options: rows("select option_name, option_value from wp_options where (option_name like 'fppm\\_%' escape '\\' or option_name like 'gff\\_dbk\\_%' escape '\\') order by option_name collate binary")
      .map((r) => [r.option_name, kv(r.option_value)]),
    transients: rows("select name, value from transients order by name collate binary").map((r) => [r.name, kv(r.value)]),
  };
}
const canonState = (s: any) => ({ ...s, usermeta: s.usermeta.map(([u, k, v]: any) => [u, k, canonKv(v)]), options: s.options.map(([k, v]: any) => [k, canonKv(v)]),
  transients: s.transients.map(([k, v]: any) => [k, canonKv(v)]) });

/** The password the plugin's form required: posted to the plugin only (intended difference: no passwords), and left out of its refill values. */
const PASSWORD = "correct-horse-1";
const phpW = fakeWorld(), tsW = fakeWorld();
const phpWorld = await fakeServer(phpW.handle);
const tsWorld = await fakeServer(tsW.handle);
const phpOut = await php<{ results: { reply: any; mail: any[]; auth: any[]; state: any }[] }>("action-php.php", {
  now: NOW, rpc: phpWorld.base, steps: steps.map((s) => ({ uid: s.uid, action: s.action, post: s.action === "@page" ? { ...s.post, fppm_pass: PASSWORD } : s.post ?? {}, get: s.get ?? {}, referer: s.referer, ua: s.ua })),
});

routeFetch(tsWorld.base);
const db = freshDb();
const env = testEnv(db);
let failed = 0;
for (const [i, s] of steps.entries()) {
  const ctx = await makeCtx(env, s.uid, "/", NOW);
  const ac = Object.assign(ctx, { post: s.post ?? {}, get: s.get ?? {}, ip: "203.0.113.50", ua: s.ua ?? "", files: {}, referer: s.referer ?? "" }) as AjaxCtx & { referer: string };
  env.MAIL_LOG!.length = 0;
  let tsReply: unknown;
  const p = phpOut.results[i];
  if (s.action === "@option") {
    for (const [k, v] of Object.entries(s.post ?? {})) {
      if (SECRET_OPTIONS[k]) { env[SECRET_OPTIONS[k]] = v; continue; }
      await setOpt(ctx, k, ["fppm_events", "fppm_announcements", "fppm_coupon_codes", "fppm_apparel_extra"].includes(k) ? JSON.parse(v) : v);
    }
    tsReply = { die: "" };
  } else if (s.action.startsWith("@meta")) {
    for (const [k, v] of Object.entries(s.post ?? {})) await setMeta(ctx, s.uid, k, /^[\[{]/.test(v) ? JSON.parse(v) : v);
    tsReply = { die: "" };
  } else if (s.action.startsWith("@job:")) {
    await JOBS[s.action.slice(5)].run(ctx);
    tsReply = { die: "" };
  } else if (s.action === "@page") {
    ac.requestUri = "/go/";
    const r = await maybeHandleRegister(ac);
    tsReply = r ? { exit: r.body } : { err: ac.regErr ?? "", old: ac.regOld ?? {} };
    if (p.reply.old) delete p.reply.old.fppm_pass;
    // Intended difference: the plugin signed the new member in and sent them to the account page.
    if (p.reply.exit?.redirect) {
      if (JSON.stringify(p.auth) !== JSON.stringify([["set_current_user", p.auth[0]?.[1]], ["auth_cookie", p.auth[0]?.[1]]])) throw new Error("step " + i + ": the plugin no longer signs in here");
      p.reply = { exit: { redirect: loginUrl(p.reply.exit.redirect) } };
    }
  } else if (s.action === "@options") {
    ac.requestUri = "/wp-admin/options.php";
    tsReply = (await saveSettings(ac)).body;
  } else if (s.action.startsWith("@admin:")) {
    const screen = s.action.slice(7);
    ac.requestUri = { settings: "/wp-admin/admin.php?page=fppm-settings", waivers: "/wp-admin/admin.php?page=fppm-waivers", drive: "/wp-admin/tools.php?page=gff-drive-backup" }[screen]!
      + (s.get ? "&" + new URLSearchParams(s.get).toString() : "");
    tsReply = { html: screen === "settings" ? settingsPage(ac) : screen === "waivers" ? await waiversPage(ac) : await dbkSettingsPage(ac) };
    if (screen === "settings") for (const [re, label, name] of SECRET_ROWS) p.reply.html = p.reply.html.replace(re, () => secretRow(label, name, !!env[name as keyof typeof env]));
    if (screen === "drive") p.reply.html = p.reply.html.replace(/<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON<\/label><\/th>[\s\S]*?<\/tr>/,
      '<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON</label></th>\n\t\t\t\t\t<td><p><strong>Not needed on this site</strong> — this plugin backs up the Gawlak Family Farms customer list, which fppm.us does not have, so every run only logs SKIPPED.</p></td>\n\t\t\t\t</tr>');
  } else {
    const isPost = s.action.startsWith("@post:");
    const h = s.uid ? (isPost ? POSTS[s.action.slice(6)] : AJAX[s.action]) : undefined;
    if (isPost) ac.requestUri = "/wp-admin/admin-post.php";
    tsReply = (h ? await h(ac) : die(isPost ? "" : "0")).body;
    if (typeof tsReply === "string") tsReply = { die: tsReply };
  }
  const want = JSON.stringify({ reply: p.reply, mail: p.mail, state: canonState(p.state) });
  const got = JSON.stringify({ reply: tsReply, mail: env.MAIL_LOG, state: canonState(snapshot(db)) });
  const d = firstDiff(want, got);
  const label = `${i} ${s.action} u${s.uid}${s.tag ? " [" + s.tag + "]" : ""}`;
  if (d) { failed++; console.log(`✗ ${label}\n  ${d}`); } else console.log(`✓ ${label}`);
}
const rd = firstDiff(JSON.stringify(phpW.log), JSON.stringify(tsW.log));
if (rd) { failed++; console.log(`✗ requests to PayPal / Printful / Google differ\n  ${rd}`); } else console.log(`✓ ${phpW.log.length} requests to PayPal, Printful and Google, identical`);
phpWorld.close(); tsWorld.close();
console.log(`\n${steps.length + 1 - failed} of ${steps.length + 1} checks pass`);
process.exit(failed ? 1 : 0);
