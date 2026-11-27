/**
 * The shared account panel on this site: it appears on /account/ for signed-in
 * members only, and /account/api/* relays to the accounts service as that
 * member (by their sign-in id), refusing strangers and other origins.
 *
 * Run: npx tsx test/account-panel.test.ts (no MariaDB needed)
 */
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { here, testEnv } from "./harness";
import app from "../src/index";
import { sessionCookie } from "../src/session";

let failed = 0;
const ok = (cond: unknown, what: string) => { if (cond) console.log("✓ " + what); else { failed++; console.log("✗ " + what); } };

const db = new DatabaseSync(":memory:");
for (const f of readdirSync(here("../migrations")).sort()) db.exec(readFileSync(here("../migrations/" + f), "utf8"));
db.exec(`insert into wp_users (id, login, email, display_name, roles, account_id) values (2, 'ann', 'ann@example.com', 'Ann', '["subscriber"]', 'acct-ann')`);

const seen: Request[] = [];
const ACCOUNTS = {
  async fetch(req: Request) {
    seen.push(req);
    return Response.json({ ok: true, op: new URL(req.url).pathname, body: req.method === "POST" ? await req.json() : null }, { status: 200 });
  },
};
const env = testEnv(db, { ACCOUNTS });
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ORIGIN = "https://fppm.us";
const ann = "__Host-fppm_session=" + (await sessionCookie(env, 2)).split(";")[0].split("=").slice(1).join("=");
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env, ctx);

// The page
const guest = await call("/account/");
ok(guest.status === 302 && !(await guest.text()).includes('id="mgc-account"'), "signed out: /account/ still goes to the join page, no panel");
const page = await (await call("/account/", { headers: { cookie: ann } })).text();
ok(page.includes('<div id="mgc-account" data-site="fppm" data-api="/account/api" data-signout="/auth/logout"></div><script src="https://accounts.martingawlakcompany.com/panel.js" defer></script>'), "signed in: the panel is on /account/");
ok(page.indexOf('<div id="mgc-account"') === page.indexOf("</header>") + "</header>".length && page.indexOf('id="mgc-account"') < page.indexOf("<main"), "…right under the site's header, above the page content");
ok(!/__SC_|__[A-Z_]+__/.test(page) && page.includes("Finish joining the Litty Committee"), "…and the team's own account part still renders below");
const home = await (await call("/", { headers: { cookie: ann } })).text();
ok(!home.includes('id="mgc-account"'), "other pages don't get the panel");

// The relay
let r = await call("/account/api/summary");
ok(r.status === 401 && seen.length === 0, "signed out: 401, nothing relayed");
r = await call("/account/api/summary", { headers: { cookie: ann } });
const last = seen.at(-1)!;
ok(r.status === 200 && last.headers.get("x-mgc-account") === "acct-ann" && last.headers.get("x-mgc-site") === "fppm", "GET relays as the member's sign-in id, naming this site");
r = await call("/account/api/thread?with=acct-bo", { headers: { cookie: ann } });
ok(new URL(seen.at(-1)!.url).search === "?with=acct-bo", "the query string goes along");
r = await call("/account/api/send", { method: "POST", headers: { cookie: ann, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ to: "acct-bo", body: "Hi" }) });
const sent = (await r.json()) as { body: { body: string } };
ok(r.status === 200 && sent.body.body === "Hi", "POST relays the body");
const before = seen.length;
r = await call("/account/api/send", { method: "POST", headers: { cookie: ann, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
ok(r.status === 403 && seen.length === before, "POST from another origin is refused");
r = await call("/account/api/summary", { headers: { cookie: ann, "x-mgc-account": "someone-else" } });
ok(seen.at(-1)!.headers.get("x-mgc-account") === "acct-ann", "a visitor can't pick whose Inbox it is");
const noBinding = await app.fetch(new Request(ORIGIN + "/account/api/summary", { headers: { cookie: ann } }), testEnv(db), ctx);
ok(noBinding.status === 503, "without the binding: 503, not an error page");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
