import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { brands } from "@mgc/brands";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth";
import { contactEmail, sendEmail } from "./email";
import type { Env } from "./env";
import { Inbox, inboxHttp, type Db } from "./inbox";
// Bundled as text (see [[rules]] in wrangler.toml): served from code, so a
// change needs no static-asset upload.
import panelCss from "../panel/panel.css";
import panelJs from "../panel/panel.js";

const app = new Hono<{ Bindings: Env }>();

/** Which sign-in buttons the sign-in page should show. */
app.get("/api/config", (c) =>
  c.json({
    google: Boolean(c.env.GOOGLE_CLIENT_ID),
    apple: Boolean(c.env.APPLE_CLIENT_ID),
    privyAppId: c.env.PRIVY_APP_ID || null,
  }),
);

/**
 * Admin only: register every brand site as a sign-in client. Returns each new
 * client's id and secret once; put them in that site's Cloudflare settings as
 * SSO_CLIENT_ID and SSO_CLIENT_SECRET.
 */
app.post("/api/admin/brand-clients", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user.role !== "admin") return c.json({ error: "Admins only" }, 403);

  const { origin } = (await c.req.json().catch(() => ({}))) as { origin?: string };
  let targets = brands
    .map((b) => ({ name: b.name, origin: new URL(b.url).origin }))
    .filter((b, i, all) => all.findIndex((x) => x.origin === b.origin) === i)
    .filter((b) => !origin || b.origin === origin);
  // Local development: allow registering a site running on localhost.
  if (!targets.length && origin && c.env.BETTER_AUTH_URL.startsWith("http://localhost") && ["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
    targets = [{ name: "Local dev site", origin }];
  }
  if (targets.length === 0) return c.json({ error: "Unknown brand origin" }, 400);

  const created = [];
  for (const t of targets) {
    const client = await auth.api
      .adminCreateOAuthClient({
      headers: c.req.raw.headers,
      body: {
        client_name: t.name,
        client_uri: t.origin,
        redirect_uris: [`${t.origin}/auth/callback`],
        post_logout_redirect_uris: [`${t.origin}/`],
        token_endpoint_auth_method: "client_secret_basic",
        // Loopback redirect URIs are only allowed for "native" clients (RFC 8252).
        application_type: new URL(t.origin).protocol === "http:" ? "native" : "web",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email offline_access",
        // First-party sites: no "allow access?" screen.
        skip_consent: true,
      },
    })
      .catch((err: { body?: { error_description?: string; message?: string } }) => {
        throw new HTTPException(400, { message: err.body?.error_description ?? err.body?.message ?? "Could not register client" });
      });
    created.push({ name: t.name, origin: t.origin, client_id: client.client_id, client_secret: client.client_secret });
  }
  return c.json({ created });
});

function inboxFor(env: Env) {
  return new Inbox({
    db: env.DB as unknown as Db,
    notify: (n) => sendEmail(env, n.to, n.subject, n.html, n.text, { name: n.fromName, address: n.fromAddress, replyTo: env.CONTACT_TO }),
  });
}

/** The shared account panel every brand site puts on its account page. */
const PANEL = `(()=>{const CSS_TEXT=${JSON.stringify(panelCss)};\n${panelJs}\n})();`;
app.get("/panel.js", (c) =>
  c.body(PANEL, 200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  }),
);

/** The Inbox for someone signed in here (this site's own pages). */
app.on(["GET", "POST"], "/api/inbox/:op", async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Sign in again." }, 401);
  if (c.req.method === "POST" && c.req.header("origin") !== new URL(c.env.BETTER_AUTH_URL).origin) {
    return c.json({ error: "Wrong origin" }, 403);
  }
  return inboxHttp(inboxFor(c.env), session.user.id, "mgc", c.req.raw, c.req.param("op"));
});

/** Brand sites send people here to sign out everywhere. */
app.get("/sign-out", async (c) => {
  const auth = createAuth(c.env);
  const res = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
  const target = c.req.query("redirect");
  const origins = new Set(brands.map((b) => new URL(b.url).origin));
  const allowed = target && URL.canParse(target) && origins.has(new URL(target).origin);
  const headers = new Headers({ location: allowed ? target : "/sign-in" });
  for (const cookie of res.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
});

// OpenID Connect discovery. The issuer is .../api/auth, so clients look for it
// there; it's also served at the root for tools that expect it.
const discovery = (c: { env: Env; req: { raw: Request } }) =>
  oauthProviderOpenIdConfigMetadata(createAuth(c.env))(c.req.raw);
app.get("/api/auth/.well-known/openid-configuration", discovery);
app.get("/.well-known/openid-configuration", discovery);

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;

/**
 * Private Inbox entrypoint for the brand sites (a service binding, never
 * reachable from the internet). The site has already checked its own session
 * and vouches for the member with x-mgc-account (the sign-in `sub`, which is
 * the accounts user id) and names itself with x-mgc-site (an @mgc/brands id).
 *   fetch("https://accounts/inbox/<op>", { headers: { "x-mgc-account": sub, "x-mgc-site": "gff" } })
 */
export class Members extends WorkerEntrypoint<Env> {
  async fetch(req: Request): Promise<Response> {
    const account = req.headers.get("x-mgc-account");
    const site = req.headers.get("x-mgc-site") ?? "";
    const op = new URL(req.url).pathname.match(/^\/inbox\/([a-z]+)$/)?.[1];
    if (!account) return Response.json({ error: "Sign in again." }, { status: 401 });
    if (!op || !brands.some((b) => b.id === site)) return Response.json({ error: "Not found" }, { status: 404 });
    // The site, not a browser, is calling: the site-only operations (links, link) are allowed.
    return inboxHttp(inboxFor(this.env), account, site, req, op, { siteOps: true });
  }
}

/**
 * Private mail entrypoint for the brand sites (a service binding, never reachable
 * from the internet): Cloudflare Pages can't hold the send_email binding itself.
 */
export class Mailer extends WorkerEntrypoint<Env> {
  async contact(m: { name: string; email: string; phone: string; message: string }): Promise<boolean> {
    const mail = contactEmail(m);
    try {
      await sendEmail(this.env, this.env.CONTACT_TO, mail.subject, mail.html, mail.text);
      return true;
    } catch (err) {
      console.error("contact mail failed", err);
      return false;
    }
  }
}
