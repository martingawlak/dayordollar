/**
 * fppm.us (Fort Pierce Purple Martins FC) without WordPress: the
 * fppm-team-manager plugin's pages, forms, admin-post and AJAX handlers,
 * admin screens and the installable app, plus GFF Drive Backup's nightly log,
 * on a Cloudflare Worker with D1. Sign-in is the shared accounts service.
 */
import { Hono } from "hono";
import type { Env } from "./env";
import { AJAX, POSTS } from "./actions";
import { runDue } from "./jobs";
import { type AjaxCtx, die } from "./ajax";
import { makeCtx } from "./ctx";
import { currentUserId, renewedCookie, SESSION_COOKIE, sameOrigin } from "./session";
import { handleAuth } from "./sso";
import { pageResponse } from "./render/page";
import { adminRoute } from "./admin";
import { seedEvents } from "./fppm/events";
import { LLMS_TXT, SITEMAP_XML } from "./agents";
import { inboxProxy } from "./account-panel";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// www.fppm.us → fppm.us, path and query kept (sign-in only knows the bare domain's callback address).
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// Sliding sign-in: a visit renews a session cookie that is over a day old (90 days), unless the response sets it.
app.use("*", async (c, next) => {
  await next();
  const fresh = await renewedCookie(c.env, c.req.raw);
  if (!fresh) return;
  if (c.res.headers.getSetCookie().some((h) => h.startsWith(SESSION_COOKIE + "="))) return;
  c.res = new Response(c.res.body, c.res);
  c.res.headers.append("set-cookie", fresh);
});

app.get("/llms.txt", (c) => c.body(LLMS_TXT, 200, { "content-type": "text/plain; charset=utf-8" }));
// WordPress's own robots.txt (outside the members-only gate, as is_robots() was), pointing at this sitemap.
app.get("/robots.txt", (c) => c.body("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n\nSitemap: " + (c.env.SITE_ORIGIN ?? "https://fppm.us") + "/sitemap.xml\n", 200, { "content-type": "text/plain; charset=utf-8" }));
app.get("/sitemap.xml", (c) => c.body(SITEMAP_XML, 200, { "content-type": "application/xml; charset=utf-8" }));
app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("select count(*) as users from wp_users").first<{ users: number }>();
  return c.json({ ok: true, users: row?.users ?? 0 });
});

app.get("/auth/*", async (c) => (await handleAuth(c.env, c.req.raw)) ?? c.notFound());
// WordPress's sign-in page (and Nextend's ?loginSocial=google links) land on the shared accounts service.
app.all("/wp-login.php", (c) => {
  const u = new URL(c.req.url);
  const to = u.searchParams.get("redirect_to") ?? u.searchParams.get("redirect") ?? "/account/";
  let path = "/account/";
  try { const t = new URL(to, c.req.url); if (t.origin === u.origin) path = t.pathname + t.search + t.hash; } catch { /* keep the default */ }
  return c.redirect("/auth/login?returnTo=" + encodeURIComponent(path), 302);
});

/** admin-ajax.php / admin-post.php: the plugin's handler for the action, as WordPress picked it. */
async function dispatch(c: any, table: typeof AJAX, isAjax: boolean): Promise<Response> {
  const req: Request = c.req.raw;
  const url = new URL(req.url);
  const post: Record<string, string> = {};
  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("The link you followed has expired.", { status: 403 });
    const form = await req.formData().catch(() => new FormData());
    for (const [k, v] of form.entries()) if (typeof v === "string") post[k] = v;
  }
  const get = Object.fromEntries(url.searchParams);
  const action = post.action ?? get.action ?? "";
  const uid = await currentUserId(c.env, req);
  // A link-only action (the CSV exports, Fetch catalog, Sync) must be followed from this site's own pages.
  if (req.method !== "POST" && !(req.headers.get("sec-fetch-site") === "same-origin" || (req.headers.get("referer") ?? "").startsWith(url.origin + "/"))) {
    return new Response("The link you followed has expired.", { status: 403 });
  }
  const h = uid ? table[action] : undefined;
  if (!h) return die(isAjax ? "0" : "").toResponse();
  const ctx = await makeCtx(c.env, uid, url.pathname + url.search);
  await seedEvents(ctx);
  const ac: AjaxCtx = Object.assign(ctx, { post, get, files: {}, ip: req.headers.get("cf-connecting-ip") ?? "", ua: req.headers.get("user-agent") ?? "", referer: req.headers.get("referer") ?? "" });
  return (await h(ac)).toResponse();
}
app.all("/wp-admin/admin-ajax.php", (c) => dispatch(c, AJAX, true));
app.all("/wp-admin/admin-post.php", (c) => dispatch(c, POSTS, false));

for (const p of ["/admin", "/admin/", "/wp-admin/admin.php", "/wp-admin/options.php", "/wp-admin/tools.php"]) {
  app.all(p, async (c) => (await adminRoute(c.env, c.req.raw)) ?? c.notFound());
}

// The shared Inbox (src/account-panel.ts): the panel on /account/ calls here; we vouch for the member to the accounts service.
app.all("/account/api/*", async (c) => {
  const uid = await currentUserId(c.env, c.req.raw);
  const row = uid ? await c.env.DB.prepare("select account_id from wp_users where id = ?").bind(uid).first<{ account_id: string | null }>() : null;
  return inboxProxy(c.env.ACCOUNTS, c.req.raw, "fppm", row?.account_id ?? null);
});
app.all("*", (c) => pageResponse(c.env, c.req.raw));

export default {
  fetch: app.fetch,
  /** The one cron trigger: run whatever is due at this time (src/jobs.ts). */
  async scheduled(e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(makeCtx(env, 0, "/").then((c) => runDue(c, new Date(e.scheduledTime))).catch((err) => console.error("scheduled jobs failed", err)));
  },
};
