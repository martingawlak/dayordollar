import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { brands } from "@mgc/brands";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth";
import type { Env } from "./env";

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
