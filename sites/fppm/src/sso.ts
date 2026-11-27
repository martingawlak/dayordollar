/**
 * Sign-in through the shared Martin Gawlak Company accounts service (OpenID
 * Connect, authorization code + PKCE). The account is matched to the existing
 * WordPress user by account id, then by email; a new person gets a new user
 * with the WordPress default role. Replaces wp-login.php and Nextend Social Login (Google).
 */
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { Env } from "./env";
import { cookie, readCookie, sessionCookie, SESSION_COOKIE } from "./session";

const TX_COOKIE = "__Host-fppm_sso_tx";
interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; userinfo_endpoint: string; jwks_uri: string }
const discoveries = new Map<string, Promise<Discovery>>();
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function discover(issuer: string): Promise<Discovery> {
  let d = discoveries.get(issuer);
  if (!d) {
    d = fetch(`${issuer}/.well-known/openid-configuration`).then((r) => {
      if (!r.ok) throw new Error(`discovery ${r.status}`);
      return r.json() as Promise<Discovery>;
    });
    d.catch(() => discoveries.delete(issuer));
    discoveries.set(issuer, d);
  }
  return d;
}

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const safePath = (p: string | null) => (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : "/");

function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ location, "cache-control": "no-store" });
  cookies.forEach((c) => h.append("set-cookie", c));
  return new Response(null, { status: 302, headers: h });
}

/** Find or create the WordPress user for a signed-in account. */
export async function userForAccount(env: Env, accountId: string, email: string, name: string): Promise<number> {
  const byAccount = await env.DB.prepare("select id from wp_users where account_id = ?").bind(accountId).first<{ id: number }>();
  if (byAccount) return byAccount.id;
  const byEmail = email
    ? await env.DB.prepare("select id from wp_users where email = ? collate nocase and account_id is null order by id limit 1").bind(email).first<{ id: number }>()
    : null;
  if (byEmail) {
    await env.DB.prepare("update wp_users set account_id = ? where id = ?").bind(accountId, byEmail.id).run();
    return byEmail.id;
  }
  const created = await env.DB.prepare(
    "insert into wp_users (id, login, email, display_name, registered, roles, account_id) " +
      "values ((select coalesce(max(id), 0) + 1 from wp_users), ?, ?, ?, datetime('now'), '[\"subscriber\"]', ?) returning id",
  ).bind(email || accountId, email, name || email, accountId).first<{ id: number }>();
  return created!.id;
}

export async function handleAuth(env: Env, req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const secret = enc.encode(env.SESSION_SECRET);

  if (url.pathname === "/auth/login") {
    const config = await discover(env.SSO_ISSUER);
    const state = random();
    const verifier = random();
    const tx = await new SignJWT({ state, verifier, returnTo: safePath(url.searchParams.get("returnTo")) })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secret);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
    const to = new URL(config.authorization_endpoint);
    to.search = new URLSearchParams({
      response_type: "code", client_id: env.SSO_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`,
      scope: "openid profile email", state, code_challenge: challenge, code_challenge_method: "S256",
    }).toString();
    return redirect(to.toString(), [cookie(TX_COOKIE, tx, 600)]);
  }

  if (url.pathname === "/auth/callback") {
    const fail = (why: string) => new Response(`Sign-in failed: ${why}. Please try again.`, { status: 400 });
    const txToken = readCookie(req, TX_COOKIE);
    if (!txToken) return fail("the sign-in attempt expired");
    let tx: { state: string; verifier: string; returnTo: string };
    try {
      tx = (await jwtVerify(txToken, secret, { algorithms: ["HS256"] })).payload as unknown as typeof tx;
    } catch {
      return fail("the sign-in attempt expired");
    }
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("state") !== tx.state) return fail("invalid response");
    const config = await discover(env.SSO_ISSUER);
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${btoa(`${encodeURIComponent(env.SSO_CLIENT_ID)}:${encodeURIComponent(env.SSO_CLIENT_SECRET)}`)}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${url.origin}/auth/callback`, code_verifier: tx.verifier }),
    });
    if (!tokenRes.ok) return fail("could not complete sign-in");
    const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    if (!tokens.id_token || !tokens.access_token) return fail("no identity returned");
    let set = jwks.get(config.jwks_uri);
    if (!set) jwks.set(config.jwks_uri, (set = createRemoteJWKSet(new URL(config.jwks_uri))));
    const { payload } = await jwtVerify(tokens.id_token, set, { issuer: config.issuer, audience: env.SSO_CLIENT_ID });
    const info = (await (await fetch(config.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } })).json()) as
      { sub?: string; email?: string; name?: string };
    if (info.sub !== payload.sub) return fail("invalid response");
    const uid = await userForAccount(env, String(payload.sub), (info.email ?? "").toLowerCase(), info.name ?? "");
    return redirect(tx.returnTo, [await sessionCookie(env, uid), cookie(TX_COOKIE, "", 0)]);
  }

  if (url.pathname === "/auth/logout") {
    const signOut = new URL("/sign-out", new URL(env.SSO_ISSUER).origin);
    signOut.searchParams.set("redirect", `${url.origin}/`);
    return redirect(signOut.toString(), [cookie(SESSION_COOKIE, "", 0)]);
  }

  // Local development only: sign in as an imported WordPress user.
  if (url.pathname === "/auth/dev-login" && env.DEV_LOGIN === "1" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    const uid = Number(url.searchParams.get("uid"));
    const row = await env.DB.prepare("select id from wp_users where id = ?").bind(uid).first();
    return row ? redirect("/", [await sessionCookie(env, uid)]) : new Response("no such user", { status: 404 });
  }

  return null;
}
