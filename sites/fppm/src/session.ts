/**
 * Who is signed in. Replaces WordPress's login cookie and the check_ajax_referer()
 * nonce: a signed, HTTP-only session cookie holding the WordPress user id, and
 * a same-origin check on every POST (what the nonce protected against).
 */
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "./env";

export const SESSION_COOKIE = "__Host-fppm_session";
/** 90 days, renewed at most once a day while the person keeps visiting (Martin, 2026-11-27). */
const TTL = 60 * 60 * 24 * 90;
const RENEW_AFTER = 60 * 60 * 24;
const key = (env: Env) => new TextEncoder().encode(env.SESSION_SECRET);

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
}

export const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function sessionCookie(env: Env, uid: number): Promise<string> {
  const token = await new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${TTL}s`).sign(key(env));
  return cookie(SESSION_COOKIE, token, TTL);
}

/** A fresh cookie when the signed-in one is over a day old (sliding 90 days); undefined otherwise. */
export async function renewedCookie(env: Env, req: Request): Promise<string | undefined> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, key(env), { algorithms: ["HS256"] });
    const age = Date.now() / 1000 - Number(payload.iat ?? 0);
    if (age < RENEW_AFTER) return undefined;
    const uid = Number(payload.uid);
    const row = await env.DB.prepare("select id from wp_users where id = ?").bind(uid).first();
    return row ? sessionCookie(env, uid) : undefined;
  } catch {
    return undefined;
  }
}

/** get_current_user_id(): 0 when signed out. */
export async function currentUserId(env: Env, req: Request): Promise<number> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return 0;
  try {
    const { payload } = await jwtVerify(token, key(env), { algorithms: ["HS256"] });
    const uid = Number(payload.uid);
    const row = await env.DB.prepare("select id from wp_users where id = ?").bind(uid).first();
    return row ? uid : 0;
  } catch {
    return 0;
  }
}

/** check_ajax_referer(): the request must come from this site's own pages. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin;
}
