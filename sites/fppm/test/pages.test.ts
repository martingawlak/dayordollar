/**
 * The Worker end to end, through its fetch handler: the theme frame around
 * each page, the gates, the join form posting to its page, admin-post and
 * admin-ajax dispatch, the admin screens, the app endpoints, /llms.txt and
 * /sitemap.xml, the www redirect, the 90-day sign-in renewal, the one cron
 * trigger, sign-in matching, and the importer's extra administrator.
 *
 * With FPPM_WP_URL set to a local copy of the site (real WordPress 7.1.5 on
 * Martin's export, test/wp-real.sh), the Worker's whole pages are also
 * compared with WordPress's own, byte for byte after the intended
 * differences (MIGRATION.md) are applied to WordPress's side.
 *
 * Run: npx tsx test/pages.test.ts
 */
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { SignJWT } from "jose";
import worker from "../src/index";
import { d1 } from "./d1-shim";
import { fakeServer, firstDiff, freshDb, here, NOW, routeFetch, testEnv } from "./harness";
import { fakeWorld } from "./fakes";
import { sessionCookie, SESSION_COOKIE } from "../src/session";
import { userForAccount } from "../src/sso";
import { makeCtx } from "../src/ctx";
import { runDue } from "../src/jobs";
import type { Env } from "../src/env";
import { panelHtml } from "../src/account-panel";

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log("✓ " + name); } else { failed++; console.log("✗ " + name + (detail ? "\n  " + detail : "")); }
}
const world = fakeWorld();
const server = await fakeServer(world.handle);
routeFetch(server.base);
Date.now = () => NOW * 1000;

const db = freshDb();
const env = testEnv(db, { DEV_LOGIN: "" });
const exec = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException: () => {} } as unknown as ExecutionContext;
const cookieFor = async (e: Env, uid: number) => (await sessionCookie(e, uid)).split(";")[0];
async function get(path: string, uid = 0, headers: Record<string, string> = {}, e: Env = env): Promise<Response> {
  const h: Record<string, string> = { ...headers };
  if (uid) h.cookie = await cookieFor(e, uid);
  return worker.fetch(new Request("https://fppm.us" + path, { headers: h, redirect: "manual" }), e, exec);
}
async function post(path: string, form: Record<string, string>, uid = 0, origin = "https://fppm.us", extra: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", ...extra };
  if (origin) h.origin = origin;
  if (uid) h.cookie = await cookieFor(env, uid);
  return worker.fetch(new Request("https://fppm.us" + path, { method: "POST", headers: h, body: new URLSearchParams(form).toString(), redirect: "manual" }), env, exec);
}

/* ---- Pages and gates ---- */
{
  const r = await get("/");
  const html = await r.text();
  check("front page: 200, the theme frame, the join form, the merch block, the app head and pill", r.status === 200 && html.startsWith("<!DOCTYPE html>")
    && html.includes("<title>FPPM &#8211; Fort Pierce Purple Martins FC</title>") && html.includes('class="fppm-wrap"') && html.includes("<h3>Team apparel</h3>")
    && html.includes('<link rel="manifest" href="https://fppm.us/?fppm_pwa=manifest">') && html.includes('id="fppm-install"') && !/__[A-Z_]+__/.test(html) && !html.includes('name="fppm_pass"')
    && html.includes('<body class="home wp-singular page-template-default page page-id-33 wp-custom-logo'));
  check("front page: texturized as WordPress's template does", html.includes("After you register you&#8217;ll get a PayPal button") && html.includes('<img decoding="async" class="fppm-crest-img"'));
  check("front page: one style block for two shortcodes", html.split("@import url('https://fonts.googleapis.com/css2?family=Oswald").length === 2);
  check("front page: the Google button goes to the accounts sign-in", html.includes('href="/auth/login?returnTo=%2F" rel="nofollow" aria-label="Continue with &lt;b&gt;Google&lt;/b&gt;"'));
}
for (const [path, to] of [["/account/", "https://fppm.us/go/?fppm_gate=1"], ["/roster/", "https://fppm.us/go/?fppm_gate=1"], ["/nope/", "https://fppm.us/go/?fppm_gate=1"]] as const) {
  const r = await get(path);
  check(`signed out ${path} → the join page`, r.status === 302 && r.headers.get("location") === to, r.status + " " + r.headers.get("location"));
}
{
  const r = await get("/roster");
  check("/roster → /roster/ (301)", r.status === 301 && r.headers.get("location") === "https://fppm.us/roster/");
  const g = await get("/go/");
  check("/go/ is public", g.status === 200 && (await g.text()).includes("<title>Go &#8211; FPPM</title>"));
  const m = await get("/account/", 4);
  const mh = await m.text();
  check("member /account/: the dashboard in the frame, body class logged-in", m.status === 200 && mh.includes("Pat Player</h2>") && mh.includes("page-id-10 logged-in wp-custom-logo") && mh.includes("I&#039;m in"));
  const ro = await get("/roster/", 4);
  check("member /roster/: the roster page", ro.status === 200 && (await ro.text()).includes("Head Coach &#8211; Elsadig Elshreif"));
  const bare = await get("/roster/", 6);
  check("bare sign-in /roster/ → /account/ to finish joining", bare.status === 302 && bare.headers.get("location") === "https://fppm.us/account/");
  const bareAcct = await get("/account/", 6);
  check("bare sign-in /account/: finish joining", bareAcct.status === 200 && (await bareAcct.text()).includes("Finish joining the Litty Committee"));
  const nf = await get("/nope/", 4);
  check("member, unknown page: 404 in the frame", nf.status === 404 && (await nf.text()).includes("error404"));
  const st = await get("/account/", 2);
  check("staff /account/: the staff dashboard", (await st.text()).includes("Fort Pierce Purple Martins — Staff</h2>"));
}

/* ---- The join form posting to its page ---- */
{
  const form = { fppm_register_nonce: "x", fppm_action: "register", fppm_type: "fan", fppm_first: "Web", fppm_last: "Joiner", fppm_email: "web.joiner@example.test", fppm_phone: "1",
    fppm_address: "1 St", fppm_city: "FP", fppm_state: "FL", fppm_zip: "34950", fppm_waiver_accept: "1", fppm_oath_accept: "1" };
  const bad = await post("/go/", { ...form, fppm_email: "nope" });
  const bh = await bad.text();
  check("join refused: the page again, with the error and the values", bad.status === 200 && bh.includes("Please enter a valid email address.") && bh.includes('value="Joiner"'));
  const cross = await post("/go/", form, 0, "https://evil.example");
  check("join from another site: refused", cross.status === 403);
  const ok = await post("/go/", form, 0, "https://fppm.us", { "cf-connecting-ip": "198.51.100.7", "user-agent": "TestBrowser/1.0" });
  check("joined: sent to sign in, back to the welcome note", ok.status === 302 && ok.headers.get("location") === "/auth/login?returnTo=%2Faccount%2F%3Ffppm_note%3Dregistered", ok.headers.get("location") ?? "");
  const w = db.prepare("select m.meta_value v from wp_usermeta m join wp_users u on u.id = m.user_id where u.email = 'web.joiner@example.test' and m.meta_key = 'fppm_waiver'").get() as { v: string };
  const wv = JSON.parse(w.v);
  check("joined: the waiver record (version, hash, time, IP, browser, name, email)", wv.accepted === 1 && wv.version === "1.0" && /^[0-9a-f]{32}$/.test(wv.hash) && wv.at === "2026-11-20 07:00:00"
    && wv.ip === "198.51.100.7" && wv.ua === "TestBrowser/1.0" && wv.name === "Web Joiner" && wv.email === "web.joiner@example.test", w.v);
  const ln = await post("/account/", form, 4);
  check("signed in, posting the join form: ignored (the dashboard)", ln.status === 200);
}

/* ---- admin-post.php / admin-ajax.php ---- */
{
  const r = await post("/wp-admin/admin-post.php", { action: "fppm_rsvp", id: "1", status: "in", _wpnonce: "x" }, 4, "https://fppm.us", { referer: "https://fppm.us/account/" });
  check("RSVP: back to the account page with the note", r.status === 302 && r.headers.get("location") === "https://fppm.us/account/?fppm_note=rsvpset");
  const anon = await post("/wp-admin/admin-post.php", { action: "fppm_rsvp", id: "1", status: "in" });
  check("admin-post signed out: empty (no _nopriv handlers)", anon.status === 200 && (await anon.text()) === "");
  const x = await post("/wp-admin/admin-post.php", { action: "fppm_rsvp", id: "1", status: "in" }, 4, "");
  check("admin-post without an Origin: refused", x.status === 403);
  const csv = await get("/wp-admin/admin-post.php?action=fppm_export_roster&_wpnonce=x", 2, { referer: "https://fppm.us/account/" });
  check("roster CSV for staff", csv.status === 200 && csv.headers.get("content-type") === "text/csv; charset=utf-8" && (await csv.text()).startsWith("name,type,status,email"));
  const csvX = await get("/wp-admin/admin-post.php?action=fppm_export_roster", 2);
  check("roster CSV link from another site: refused", csvX.status === 403);
  const die = await post("/wp-admin/admin-post.php", { action: "fppm_announce", fppm_a_title: "x", fppm_a_body: "y" }, 4);
  check("a member posting a staff action: WordPress's error page", die.status === 500 && (await die.text()).includes("Not allowed."));
  const aj = await post("/wp-admin/admin-ajax.php", { action: "fppm_shop_create", variant: "5001" });
  check("admin-ajax signed out: 0", (await aj.text()) === "0");
  const aj2 = await post("/wp-admin/admin-ajax.php", { action: "fppm_shop_create", variant: "5001", _ajax_nonce: "x" }, 3);
  const j = await aj2.json() as { success: boolean; data: { id: string } };
  check("admin-ajax: a PayPal order for a signed-in member", j.success && /^PPORDER\d+$/.test(j.data.id));
  const del = await post("/wp-admin/admin-post.php", { action: "fppm_self_delete", _wpnonce: "x" }, 9);
  check("deleting one's account signs out", del.status === 302 && del.headers.get("location") === "https://fppm.us/?fppm_bye=1" && (del.headers.get("set-cookie") ?? "").startsWith(SESSION_COOKIE + "=; "));
}

/* ---- Admin screens ---- */
{
  const a = await get("/admin", 1);
  const ah = await a.text();
  check("/admin: Purple Martins settings for an administrator, credentials shown as set / not set", a.status === 200 && ah.includes("Fort Pierce Purple Martins — Settings")
    && ah.includes("<tr><th scope=\"row\">PayPal Secret</th><td><p><strong>Set</strong>") && ah.includes("<tr><th scope=\"row\">Service-account JSON</th><td><p><strong>Not set</strong>")
    && !ah.includes('name="fppm_pp_secret"') && !ah.includes("test-pp-secret"));
  check("/admin for staff: refused", (await get("/admin", 2)).status === 403);
  const out = await get("/admin");
  check("/admin signed out: to sign in", out.status === 302 && (out.headers.get("location") ?? "").includes("/auth/login?returnTo="));
  const w = await get("/wp-admin/admin.php?page=fppm-waivers", 1);
  check("Waivers page", w.status === 200 && (await w.text()).includes("on file</span></h1>"));
  const d = await get("/wp-admin/tools.php?page=gff-drive-backup", 1);
  const dh = await d.text();
  check("Drive backup page: next run in Eastern time, the log", dh.includes("<strong>Next run:</strong> Nov 27, 2026 11:01 PM") && dh.includes("SKIPPED: main GFF plugin not active"), dh.slice(0, 0));
  const s = await post("/wp-admin/options.php", { option_page: "fppm_settings", fppm_team_name: " New Name ", fppm_pp_secret: "should-not-be-saved" }, 1, "https://fppm.us", { referer: "https://fppm.us/wp-admin/admin.php?page=fppm-settings" });
  const saved = db.prepare("select option_value v from wp_options where option_name = 'fppm_team_name'").get() as { v: string };
  const leaked = db.prepare("select count(*) n from wp_options where option_name = 'fppm_pp_secret'").get() as { n: number };
  check("options.php saves the settings, never a credential", s.status === 302 && s.headers.get("location") === "https://fppm.us/wp-admin/admin.php?page=fppm-settings&settings-updated=true" && saved.v === "New Name" && leaked.n === 0);
}

/* ---- The app, calendars, guides, redirects ---- */
{
  const m = await get("/?fppm_pwa=manifest");
  check("manifest", m.headers.get("content-type") === "application/manifest+json; charset=utf-8" && (await m.json() as { start_url: string }).start_url === "https://fppm.us/account/");
  const sw = await get("/anything/?fppm_pwa=sw");
  check("service worker (any address)", sw.headers.get("service-worker-allowed") === "/" && (await sw.text()).startsWith("/* FPPM service worker */\nconst FPPM_CACHE = 'fppm-v0.10.17';"));
  const ics = await get("/?fppm_ics=2");
  const it = await ics.text();
  check(".ics download", ics.headers.get("content-type") === "text/calendar; charset=utf-8" && it.includes("SUMMARY:Match vs Miami United\r\n") && it.includes("DTSTART:20261128T193000\r\n"));
  check(".ics unknown: 404", (await get("/?fppm_ics=404")).status === 404);
  const llms = await get("/llms.txt");
  check("/llms.txt", llms.status === 200 && (await llms.text()).startsWith("# Fort Pierce Purple Martins FC"));
  const sm = await get("/sitemap.xml");
  check("/sitemap.xml: the public pages", (await sm.text()).includes("<loc>https://fppm.us/go/</loc>"));
  const rb = await get("/robots.txt");
  check("/robots.txt: public, lets every crawler in, names the sitemap", rb.status === 200 && (await rb.text()).includes("Sitemap: https://fppm.us/sitemap.xml"));
  const www = await worker.fetch(new Request("https://www.fppm.us/go/?a=1", { redirect: "manual" }), env, exec);
  check("www → bare domain", www.status === 301 && www.headers.get("location") === "https://fppm.us/go/?a=1");
  const wl = await get("/wp-login.php?loginSocial=google&redirect=https%3A%2F%2Ffppm.us%2Fgo%2F");
  check("Nextend's and WordPress's sign-in links → the accounts sign-in", wl.status === 302 && wl.headers.get("location") === "/auth/login?returnTo=%2Fgo%2F");
}

/* ---- Sign-in: 90 days, renewed; accounts matched to WordPress users ---- */
{
  const key = new TextEncoder().encode(env.SESSION_SECRET);
  const old = await new SignJWT({ uid: 4 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(NOW - 2 * 86400).setExpirationTime(NOW + 88 * 86400).sign(key);
  const r = await get("/go/", 0, { cookie: SESSION_COOKIE + "=" + old });
  const sc = r.headers.get("set-cookie") ?? "";
  check("a two-day-old sign-in is renewed for 90 days", sc.startsWith(SESSION_COOKIE + "=") && sc.includes("Max-Age=7776000"));
  const fresh = await get("/go/", 4);
  check("a fresh sign-in is left alone", !fresh.headers.get("set-cookie"));
  const byEmail = await userForAccount(env, "acct-fan", "FAN1@example.test".toLowerCase(), "Fay");
  const byAcct = await userForAccount(env, "acct-fan", "other@example.test", "x");
  const created = await userForAccount(env, "acct-new", "brand.new@example.test", "");
  const row = db.prepare("select roles, display_name from wp_users where id = ?").get(created) as { roles: string; display_name: string };
  check("sign-in: an account finds its WordPress user by email, then by account id; a new person gets a subscriber", byEmail === 3 && byAcct === 3 && created > 9 && row.roles === '["subscriber"]' && row.display_name === "brand.new@example.test");
}

/* ---- The one cron trigger ---- */
{
  const c = await makeCtx(env, 0, "/", NOW);
  const none = await runDue(c, new Date("2026-11-20T05:01:00Z"));
  const ran = await runDue(c, new Date("2026-11-21T04:01:00Z"));
  const log = db.prepare("select option_value v from wp_options where option_name = 'gff_dbk_last_log'").get() as { v: string };
  check("cron: the Drive backup runs at 04:01 UTC only, logging SKIPPED", none.length === 0 && ran.join() === "gff_dbk_daily_event" && log.v === "2026-11-20 07:00:00 — SKIPPED: main GFF plugin not active (gff_reg_collect_clients missing).", log.v);
}

/* ---- The importer: hello@martingawlakcompany.com becomes an administrator ---- */
{
  const sql = execFileSync("python3", ["-I", here("../scripts/import-wordpress.py"), "--db", "fppm_fixture"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const d2 = new DatabaseSync(":memory:");
  for (const f of readdirSync(here("../migrations")).sort()) d2.exec(readFileSync(here("../migrations/" + f), "utf8"));
  d2.exec(sql);
  const r = d2.prepare("select id, roles from wp_users where email = 'hello@martingawlakcompany.com'").get() as { id: number; roles: string };
  const secrets = d2.prepare("select count(*) n from wp_options where option_name in ('fppm_gs_json', 'fppm_pp_secret', 'fppm_printful_token', 'gff_dbk_sa_json')").get() as { n: number };
  const waivers = d2.prepare("select count(*) n from wp_usermeta where meta_key = 'fppm_waiver'").get() as { n: number };
  check("importer: hello@ added as administrator (new id), credentials left out, every waiver carried", r?.id === 10 && r.roles === '["administrator"]' && secrets.n === 0 && waivers.n === 6);
}

/* ---- Whole pages against WordPress itself (a local copy of the site) ---- */
const WP = process.env.FPPM_WP_URL;
if (WP) {
  // The Worker on the export's own data (scripts/import-wordpress.py on fppm_old), at WordPress's real clock.
  Date.now = () => new Date().getTime();
  const sql = execFileSync("python3", ["-I", here("../scripts/import-wordpress.py"), "--db", process.env.FPPM_WP_DB ?? "fppm_old", "--no-extra-admin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const d3 = new DatabaseSync(":memory:");
  for (const f of readdirSync(here("../migrations")).sort()) d3.exec(readFileSync(here("../migrations/" + f), "utf8"));
  d3.exec(sql);
  const e3 = testEnv(d3, { PAYPAL_SECRET: "set", PRINTFUL_TOKEN: "set" });
  /** WordPress's side, with the intended differences applied at their spots. */
  const normalise = (html: string, path: string) => html
    .replace(/<link rel='dns-prefetch' href='\/\/fppm\.us' \/>\n?|<link rel="alternate"[^>]*\/>\n?|<link rel="https:\/\/api\.w\.org\/"[^>]*\/>\n?|<link rel="EditURI"[^>]*\/>\n?|<link rel='shortlink'[^>]*\/>\n?|<meta name="generator"[^>]*\/>\n?/g, "")
    .replace(/<script type="text\/javascript">\s*window\._nslDOMReady[\s\S]*?<\/script>\n?/, "").replace(/<script type="text\/javascript">\(function \(undefined\) \{let scriptOptions=[\s\S]*?<\/script>/, "")
    .replace(/<a href="https:\/\/fppm\.us\/wp-login\.php\?loginSocial=google(?:&#038;redirect=[^"]*)?" rel="nofollow" aria-label="Continue with &lt;b&gt;Google&lt;\/b&gt;" data-plugin="nsl" data-action="connect" data-provider="google" data-popupwidth="600" data-popupheight="600">/g,
      '<a href="/auth/login?returnTo=' + encodeURIComponent(path) + '" rel="nofollow" aria-label="Continue with &lt;b&gt;Google&lt;/b&gt;" data-provider="google">')
    // Sign-in and sign-out are the shared accounts service's (wp_login_url / wp_logout_url).
    .replace(/https:\/\/fppm\.us\/wp-login\.php\?redirect_to=([^"&]*)/g, (_m, to: string) => { const u = new URL(decodeURIComponent(to)); return "/auth/login?returnTo=" + encodeURIComponent(u.pathname + u.search); })
    .replace(/https:\/\/fppm\.us\/wp-login\.php\?action=logout&#038;redirect_to=[^"]*/g, "/auth/logout")
    .replace(/\t\t\t<div class="fppm-field"><label>Choose a password \*<\/label>[^\n]*\n/, "");
  const nonces = (h: string) => h.replace(/value="(nonce-[a-z0-9_]+|[0-9a-f]{10})"/g, 'value="NONCE"').replace(/_wpnonce=(nonce-[a-z0-9_]+|[0-9a-f]{10})/g, "_wpnonce=NONCE")
    .replace(/fppmShopNonce="[^"]*"/, 'fppmShopNonce="NONCE"').replace(/data-nonce="[^"]*"/g, 'data-nonce="NONCE"');
  for (const [path, uid] of [["/", 0], ["/go/", 0], ["/account/", 1], ["/roster/", 1], ["/account/?fppm_note=announced", 1]] as const) {
    let wp: string;
    try {
      wp = execFileSync("curl", ["-s", "-H", "Host: fppm.us", "-H", "X-Test-User: " + uid, "-H", "X-Test-NoAdminBar: 1", WP + path], { encoding: "utf8", maxBuffer: 64 << 20 });
    } catch (e) { check("WordPress " + path, false, String(e)); continue; }
    const r = await get(path, uid, {}, e3);
    const mine = await r.text();
    let theirs = normalise(wp, path.split("?")[0]);
    // Intended: the shared account panel (MGC brand bubbles + Inbox) under the header of a member's /account/.
    if (uid && path.startsWith("/account/")) theirs = theirs.replace("</header>", () => "</header>" + panelHtml("fppm"));
    const d = firstDiff(nonces(theirs), nonces(mine));
    check(`whole page ${path} (${uid ? "signed in" : "signed out"}) = WordPress's`, !d, d ?? "");
  }
} else {
  console.log("· whole-page comparison with WordPress skipped (set FPPM_WP_URL; test/wp-real.sh starts a local copy)");
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
