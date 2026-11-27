/**
 * gawlakfamilyfarms.com without WordPress: the GFF plugin's pages, forms,
 * AJAX and admin-post actions, client admin and daily job, on a Cloudflare
 * Worker with D1.
 */
import { Hono } from "hono";
import type { Env } from "./env";
import { ACTIONS, POSTS } from "./actions";
import { JOBS, CRON_HOOKS, runScheduled } from "./jobs";
import { type AjaxCtx, die } from "./ajax";
import { makeCtx } from "./ctx";
import { currentUserId, renewedCookie, SESSION_COOKIE, sameOrigin } from "./session";
import { handleAuth } from "./sso";
import { pageResponse } from "./routes/page";
import { adminRoute } from "./admin/route";
import { restRoute } from "./aerial/rest";
import { shopPost } from "./shop/gff";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// Sliding sign-in: a visit renews a session cookie that is over a day old,
// unless the response already sets it (signing in or out).
app.use("*", async (c, next) => {
  await next();
  const fresh = await renewedCookie(c.env, c.req.raw);
  if (!fresh) return;
  if (c.res.headers.getSetCookie().some((h) => h.startsWith(SESSION_COOKIE + "="))) return;
  c.res = new Response(c.res.body, c.res);
  c.res.headers.append("set-cookie", fresh);
});

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("select count(*) as users from wp_users").first<{ users: number }>();
  return c.json({ ok: true, users: row?.users ?? 0 });
});

app.get("/auth/*", async (c) => (await handleAuth(c.env, c.req.raw)) ?? c.notFound());
// The old WordPress sign-in links (the plugin's own and Astra's) land on the shared accounts service.
app.get("/wp-login.php", (c) => {
  const to = new URL(c.req.url).searchParams.get("redirect_to") ?? "/account/";
  let path = "/account/";
  try { const u = new URL(to, c.req.url); if (u.origin === new URL(c.req.url).origin) path = u.pathname + u.search + u.hash; } catch { /* keep the default */ }
  return c.redirect("/auth/login?returnTo=" + encodeURIComponent(path), 302);
});

/** Run a plugin handler: admin-ajax.php (by action) or admin-post.php (by action), as WordPress picked it. */
async function dispatch(c: any, table: typeof ACTIONS): Promise<Response> {
  const req: Request = c.req.raw;
  const url = new URL(req.url);
  const post: Record<string, string> = {};
  const files: Record<string, File> = {};
  if (req.method === "POST") {
    const form = await req.formData().catch(() => new FormData());
    for (const [k, v] of form.entries()) { if (typeof v === "string") post[k] = v; else files[k] = v as File; }
    if (!sameOrigin(req)) return Response.json({ success: false, data: { message: "Reload the page and try again." } }, { status: 403 });
  }
  const get = Object.fromEntries(url.searchParams);
  const action = post.action ?? get.action ?? "";
  const uid = await currentUserId(c.env, req);
  const a = table[action];
  const h = a ? (uid ? a.priv : a.nopriv) : undefined;
  if (!h) return die(table === ACTIONS ? "0" : "").toResponse();
  const ctx = await makeCtx(c.env, uid, "/");
  const ac: AjaxCtx = Object.assign(ctx, {
    post, get, files, ip: req.headers.get("cf-connecting-ip") ?? "0", referer: req.headers.get("referer") ?? "", // wp_get_referer()
    later: (fn: () => Promise<unknown>) => { try { c.executionCtx.waitUntil(fn()); } catch { void fn(); } },
  });
  return (await h(ac)).toResponse();
}
// Aerial Timelapse's REST API, at the plugin's own /wp-json/ paths.
app.all("/wp-json/aerial-timelapse/*", async (c) => (await restRoute(c.env, c.req.raw)) ?? c.notFound());
app.all("/wp-admin/admin-ajax.php", (c) => dispatch(c, ACTIONS));
app.all("/wp-admin/admin-post.php", (c) => dispatch(c, POSTS));

// The client admin (src/admin/route.ts): GFF Clients, GFF Settings and the profile panels, at their wp-admin addresses.
for (const p of ["/admin", "/admin/", "/wp-admin/admin.php", "/wp-admin/options.php", "/wp-admin/user-edit.php", "/wp-admin/profile.php", "/wp-admin/tools.php", "/wp-admin/options-general.php"]) {
  app.all(p, async (c) => (await adminRoute(c.env, c.req.raw)) ?? c.notFound());
}

// The pages (GET, and the sign-up forms posting to themselves).
// The shop: "Buy now" → Stripe Checkout, and Stripe's webhook (src/shop).
app.post("/shop/*", async (c) => (await shopPost(c.env, c.req.raw)) ?? c.notFound());
app.all("*", (c) => pageResponse(c.env, c.req.raw));

export default {
  fetch: app.fetch,
  /** The plugins' WP-Cron jobs, each on its own trigger (wrangler.toml, CRON_HOOKS). */
  async scheduled(e: ScheduledController, env: Env, ctx: ExecutionContext) {
    for (const hook of CRON_HOOKS[e.cron] ?? Object.keys(JOBS)) {
      if (JOBS[hook]) ctx.waitUntil(makeCtx(env, 0, "/").then((c) => runScheduled(c, hook)).catch((err) => console.error(`job ${hook} failed`, err)));
    }
  },
};
