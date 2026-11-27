/**
 * One request's view of WordPress: who is signed in, the site's settings
 * (all loaded at once — there are about fifty), user meta with a cache,
 * transients, capabilities, and the per-request state the plugin kept in PHP
 * statics and globals ($GLOBALS['fppm_reg_err'] / ['fppm_reg_old'], the
 * once-only style block).
 */
import type { Env } from "./env";
import { rawurlencode } from "./php";

export interface User { ID: number; user_login: string; user_email: string; display_name: string; registered: string; roles: string[] }

export interface Ctx {
  env: Env;
  uid: number;
  user: User | null;
  /** https://fppm.us — what home_url() starts with. */
  origin: string;
  /** The path of the page being rendered ($_SERVER['REQUEST_URI']). */
  requestUri: string;
  /** Unix seconds (time()). */
  now: number;
  opts: Record<string, unknown>;
  metaCache: Map<string, unknown>;
  /** static $done flags. */
  once: Set<string>;
  /** $GLOBALS['fppm_reg_err'] and ['fppm_reg_old']: a failed join form, refilled. */
  regErr?: string;
  regOld?: Record<string, string>;
  /** $_GET of the page request. */
  get: Record<string, string | string[]>;
}

/**
 * Stored values: JSON for arrays (PHP's serialize() on WordPress), a JSON string literal for a
 * plain string that itself starts with [ { or " (so it reads back as text), anything else as is.
 */
export function decode(v: string | null | undefined): unknown {
  if (v == null) return "";
  const c = v[0];
  if (c === "[" || c === "{" || c === '"') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
export function encode(value: unknown): string {
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  const s = value === true ? "1" : value === false || value === null || value === undefined ? "" : String(value);
  return /^[[{"]/.test(s) ? JSON.stringify(s) : s;
}

export async function loadUser(env: Env, uid: number): Promise<User | null> {
  if (!uid) return null;
  const r = await env.DB.prepare("select id, login, email, display_name, registered, roles from wp_users where id = ?").bind(uid)
    .first<{ id: number; login: string; email: string; display_name: string; registered: string | null; roles: string }>();
  return r ? { ID: r.id, user_login: r.login, user_email: r.email, display_name: r.display_name, registered: r.registered ?? "", roles: JSON.parse(r.roles || "[]") } : null;
}

export async function makeCtx(env: Env, uid: number, requestUri = "/", now = Math.floor(Date.now() / 1000)): Promise<Ctx> {
  const origin = (env.SITE_ORIGIN ?? "https://fppm.us").replace(/\/$/, "");
  const rows = await env.DB.prepare("select option_name, option_value from wp_options").all<{ option_name: string; option_value: string | null }>();
  const opts: Record<string, unknown> = {};
  for (const r of rows.results) opts[r.option_name] = decode(r.option_value);
  const user = await loadUser(env, uid);
  return { env, uid: user ? uid : 0, user, origin, requestUri, now, opts, metaCache: new Map(), once: new Set(), get: {} };
}

/** get_option( $name, $default ). */
export const opt = (c: Ctx, name: string, fallback: unknown = false): unknown =>
  Object.prototype.hasOwnProperty.call(c.opts, name) ? c.opts[name] : fallback;

/** update_option(): the request's copy and D1 together. */
export async function setOpt(c: Ctx, name: string, value: unknown): Promise<void> {
  c.opts[name] = value;
  await c.env.DB.prepare("insert into wp_options (option_name, option_value) values (?, ?) on conflict(option_name) do update set option_value = excluded.option_value").bind(name, encode(value)).run();
}

/** get_user_meta( $uid, $key, true ): '' when missing. */
export async function meta(c: Ctx, uid: number, key: string): Promise<unknown> {
  const k = uid + "\0" + key;
  if (c.metaCache.has(k)) return c.metaCache.get(k);
  const row = await c.env.DB.prepare("select meta_value from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).first<{ meta_value: string | null }>();
  const v = decode(row?.meta_value ?? null);
  c.metaCache.set(k, v);
  return v;
}

/** update_user_meta(). */
export async function setMeta(c: Ctx, uid: number, key: string, value: unknown): Promise<void> {
  c.metaCache.set(uid + "\0" + key, typeof value === "number" ? String(value) : value);
  await c.env.DB.prepare(
    "insert into wp_usermeta (user_id, meta_key, meta_value) values (?, ?, ?) on conflict (user_id, meta_key) do update set meta_value = excluded.meta_value",
  ).bind(uid, key, encode(value)).run();
}

/** delete_user_meta(). */
export async function deleteMeta(c: Ctx, uid: number, key: string): Promise<void> {
  c.metaCache.set(uid + "\0" + key, "");
  await c.env.DB.prepare("delete from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).run();
}

/** set_transient( $name, $value, $ttl ). */
export async function setTransient(c: Ctx, name: string, value: unknown, ttl: number): Promise<void> {
  await c.env.DB.prepare("insert into transients (name, value, expires_at) values (?, ?, ?) on conflict (name) do update set value = excluded.value, expires_at = excluded.expires_at")
    .bind(name, encode(value), ttl ? c.now + ttl : 4000000000).run();
}
/** get_transient(): false when missing or expired. */
export async function getTransient(c: Ctx, name: string): Promise<unknown> {
  const r = await c.env.DB.prepare("select value from transients where name = ? and expires_at > ?").bind(name, c.now).first<{ value: string }>();
  return r ? decode(r.value) : false;
}
export async function deleteTransient(c: Ctx, name: string): Promise<void> {
  await c.env.DB.prepare("delete from transients where name = ?").bind(name).run();
}

/**
 * The site's roles and the capabilities the plugin asks about, as bxb_user_roles holds them on
 * fppm.us: administrator has everything; fppm_staff has fppm_manage; every other role only read.
 */
const ROLE_CAPS: Record<string, string[]> = {
  administrator: ["read", "manage_options", "list_users", "edit_users", "delete_users", "create_users", "fppm_manage"],
  fppm_staff: ["read", "fppm_manage"],
};
/** user_can() / current_user_can(). */
export function userCan(u: User | null, cap: string): boolean {
  if (!u) return false;
  return u.roles.some((r) => (ROLE_CAPS[r] ?? ["read"]).includes(cap));
}
export const can = (c: Ctx, cap: string) => userCan(c.user, cap);

export const loggedIn = (c: Ctx) => c.uid > 0;

/** home_url( $path ). */
export const homeUrl = (c: Ctx, path = "") => c.origin + (path === "" ? "" : "/" + path.replace(/^\/+/, ""));
/** admin_url( $path ): the Worker answers the same addresses. */
export const adminUrl = (c: Ctx, path = "") => c.origin + "/wp-admin/" + path;

/**
 * wp_create_nonce(): the Worker checks that a POST comes from this site's own pages instead
 * (session.ts sameOrigin), so the token is only a placeholder the page sends back.
 */
export const nonce = (action: string) => "nonce-" + action;

/** wp_login_url( $redirect ): the shared accounts sign-in, returning to the same page. */
export function loginUrl(redirect = ""): string {
  if (!redirect) return "/auth/login";
  const u = new URL(redirect, "https://x.invalid");
  return "/auth/login?returnTo=" + rawurlencode(u.pathname + u.search + u.hash);
}
/** wp_logout_url(). */
export const logoutUrl = () => "/auth/logout";
