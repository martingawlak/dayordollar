/**
 * "Sign in with Martin Gawlak Company" for any brand site on Cloudflare.
 *
 * Each brand is an OpenID Connect client of the accounts service. This module
 * runs the authorization-code + PKCE flow from a Pages Function or Worker and
 * keeps the signed-in user in a signed, HTTP-only cookie on the brand's domain.
 *
 * Routes handled (mount at /auth/*):
 *   GET /auth/login?returnTo=/path   start sign-in
 *   GET /auth/callback               finish sign-in
 *   GET /auth/logout                 sign out here and on the accounts service
 *   GET /auth/me                     { user } or 401, for client-side UI
 */
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface SsoEnv {
  /** e.g. https://accounts.martingawlakcompany.com/api/auth */
  SSO_ISSUER: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  /** Random 32+ byte string; signs this site's session cookie. */
  SESSION_SECRET: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

const SESSION_COOKIE = "__Host-mgc_session";
const TX_COOKIE = "__Host-mgc_sso_tx";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

const discoveryCache = new Map<string, Promise<Discovery>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function discover(issuer: string): Promise<Discovery> {
  let d = discoveryCache.get(issuer);
  if (!d) {
    d = fetch(`${issuer}/.well-known/openid-configuration`).then((r) => {
      if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
      return r.json() as Promise<Discovery>;
    });
    d.catch(() => discoveryCache.delete(issuer));
    discoveryCache.set(issuer, d);
  }
  return d;
}

function jwks(uri: string) {
  let set = jwksCache.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, set);
  }
  return set;
}

const enc = new TextEncoder();
const key = (secret: string) => enc.encode(secret);

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Only allow same-site relative paths as post-login destinations. */
function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

/** Read the signed-in user from the request, if any. */
export async function getSessionUser(request: Request, env: SsoEnv): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(env.SESSION_SECRET), { algorithms: ["HS256"] });
    return payload.user as SessionUser;
  } catch {
    return null;
  }
}

async function login(request: Request, env: SsoEnv): Promise<Response> {
  const url = new URL(request.url);
  const config = await discover(env.SSO_ISSUER);
  const state = randomString();
  const verifier = randomString();
  const tx = await new SignJWT({ state, verifier, returnTo: safeReturnTo(url.searchParams.get("returnTo")) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(key(env.SESSION_SECRET));

  const authorize = new URL(config.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.SSO_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    scope: "openid profile email",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return redirect(authorize.toString(), [cookie(TX_COOKIE, tx, 600)]);
}

async function callback(request: Request, env: SsoEnv): Promise<Response> {
  const url = new URL(request.url);
  const fail = (reason: string) =>
    new Response(`Sign-in failed: ${reason}. Please try again.`, { status: 400, headers: { "cache-control": "no-store" } });

  const txToken = readCookie(request, TX_COOKIE);
  if (!txToken) return fail("the sign-in attempt expired");
  let tx: JWTPayload & { state: string; verifier: string; returnTo: string };
  try {
    tx = (await jwtVerify(txToken, key(env.SESSION_SECRET), { algorithms: ["HS256"] })).payload as typeof tx;
  } catch {
    return fail("the sign-in attempt expired");
  }
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_description") ?? "access denied");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== tx.state) return fail("invalid response");

  const config = await discover(env.SSO_ISSUER);
  const tokenRes = await fetch(config.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${encodeURIComponent(env.SSO_CLIENT_ID)}:${encodeURIComponent(env.SSO_CLIENT_SECRET)}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/auth/callback`,
      code_verifier: tx.verifier,
    }),
  });
  if (!tokenRes.ok) return fail("could not complete sign-in");
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return fail("no identity returned");

  const { payload } = await jwtVerify(tokens.id_token, jwks(config.jwks_uri), {
    issuer: config.issuer,
    audience: env.SSO_CLIENT_ID,
  });
  const user: SessionUser = {
    id: String(payload.sub),
    email: String(payload.email ?? ""),
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };
  const session = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(env.SESSION_SECRET));
  return redirect(tx.returnTo, [cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS), cookie(TX_COOKIE, "", 0)]);
}

async function logout(request: Request, env: SsoEnv): Promise<Response> {
  const origin = new URL(request.url).origin;
  const accounts = new URL(env.SSO_ISSUER).origin;
  const signOut = new URL("/sign-out", accounts);
  signOut.searchParams.set("redirect", `${origin}/`);
  return redirect(signOut.toString(), [cookie(SESSION_COOKIE, "", 0)]);
}

/** Handle /auth/* routes. Returns null for any other path. */
export async function handleAuth(request: Request, env: SsoEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  switch (pathname.replace(/\/$/, "")) {
    case "/auth/login":
      return login(request, env);
    case "/auth/callback":
      return callback(request, env);
    case "/auth/logout":
      return logout(request, env);
    case "/auth/me": {
      const user = await getSessionUser(request, env);
      return Response.json({ user }, { status: user ? 200 : 401, headers: { "cache-control": "no-store" } });
    }
    default:
      return null;
  }
}
