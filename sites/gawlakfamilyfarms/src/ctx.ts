/**
 * One request's view of WordPress: who is signed in, the site's settings
 * (all loaded at once — there are under a hundred), user meta with a cache,
 * and the per-request state the plugin kept in PHP statics and globals
 * ($gff_reg_state, once-only flags, enqueued styles and scripts).
 */
import type { Env } from "./env";
import { rawurlencode } from "./php";

export interface User { ID: number; user_email: string; display_name: string; user_login: string; roles: string[] }

/** The plugin's global $gff_reg_state. */
export interface RegState {
  form_open: boolean;
  /** The submit handler's alert, printed where the form opens or closes. */
  notice: string;
  /** True only when a submit failed and the fields should be refilled. */
  repop: boolean;
  /** Sanitized values from the failed submit. */
  old: Record<string, any>;
}
/** wp_enqueue_script/style, wp_localize_script and wp_add_inline_script/style. A version is a string, false or null, as given. */
export interface Assets {
  scripts: Record<string, { src: string | false; ver: string | false | null }>;
  styles: Record<string, { src: string | false; ver: string | false | null }>;
  localized: Record<string, Record<string, unknown>>;
  inline_styles: Record<string, string[]>;
  inline_scripts: Record<string, string[]>;
}
export const newAssets = (): Assets => ({ scripts: {}, styles: {}, localized: {}, inline_styles: {}, inline_scripts: {} });

export const newRegState = (): RegState => ({ form_open: false, notice: "", repop: false, old: {} });

export interface Ctx {
  env: Env;
  uid: number;
  user: User | null;
  /** https://gawlakfamilyfarms.com — what home_url() starts with. */
  origin: string;
  /** get_permalink() of the page being rendered. */
  permalink: string;
  /** Unix seconds. */
  now: number;
  opts: Record<string, unknown>;
  metaCache: Map<string, unknown>;
  /** static $done flags. */
  once: Set<string>;
  /** $gff_reg_state: the page's one registration form, shared by the modular shortcodes. */
  reg: RegState;
  /** What the request enqueued, in WordPress's shapes (by handle, in order). */
  assets: Assets;
  /** add_action( 'wp_footer', … ) made while rendering: printed in priority, then registration, order. */
  footer: { prio: number; run: () => string | Promise<string> }[];
}

function decode(v: string | null): unknown {
  if (v == null) return "";
  return v.startsWith("[") || v.startsWith("{") ? JSON.parse(v) : v;
}

export async function loadUser(env: Env, uid: number): Promise<User | null> {
  if (!uid) return null;
  const r = await env.DB.prepare("select id, login, email, display_name, roles from wp_users where id = ?").bind(uid)
    .first<{ id: number; login: string; email: string; display_name: string; roles: string }>();
  return r ? { ID: r.id, user_login: r.login, user_email: r.email, display_name: r.display_name, roles: JSON.parse(r.roles || "[]") } : null;
}

export async function makeCtx(env: Env, uid: number, permalink = "/", now = Math.floor(Date.now() / 1000)): Promise<Ctx> {
  const origin = (env.SITE_ORIGIN ?? "https://gawlakfamilyfarms.com").replace(/\/$/, "");
  const rows = await env.DB.prepare("select option_name, option_value from wp_options").all<{ option_name: string; option_value: string | null }>();
  const opts: Record<string, unknown> = {};
  for (const r of rows.results) opts[r.option_name] = decode(r.option_value);
  const user = await loadUser(env, uid);
  return {
    env, uid: user ? uid : 0, user, origin, permalink: origin + permalink, now, opts, metaCache: new Map(), once: new Set(), reg: newRegState(),
    assets: newAssets(), footer: [],
  };
}

/** get_option( $name, $default ). */
export const opt = (ctx: Ctx, name: string, fallback: unknown = false): unknown =>
  Object.prototype.hasOwnProperty.call(ctx.opts, name) ? ctx.opts[name] : fallback;

/** update_option(): the request's copy and D1 together. */
export async function setOpt(ctx: Ctx, name: string, value: unknown): Promise<void> {
  ctx.opts[name] = value;
  const v = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  await ctx.env.DB.prepare("insert into wp_options (option_name, option_value) values (?, ?) on conflict(option_name) do update set option_value = excluded.option_value").bind(name, v).run();
}

/** get_user_meta( $uid, $key, true ): '' when missing. */
export async function meta(ctx: Ctx, uid: number, key: string): Promise<unknown> {
  const k = uid + "\0" + key;
  if (ctx.metaCache.has(k)) return ctx.metaCache.get(k);
  const row = await ctx.env.DB.prepare("select meta_value from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).first<{ meta_value: string | null }>();
  const v = decode(row?.meta_value ?? null);
  ctx.metaCache.set(k, v);
  return v;
}

/** update_user_meta(). */
export async function setMeta(ctx: Ctx, uid: number, key: string, value: unknown): Promise<void> {
  ctx.metaCache.set(uid + "\0" + key, value);
  const v = typeof value === "string" ? value : JSON.stringify(value);
  await ctx.env.DB.prepare(
    "insert into wp_usermeta (user_id, meta_key, meta_value) values (?, ?, ?) on conflict (user_id, meta_key) do update set meta_value = excluded.meta_value",
  ).bind(uid, key, v).run();
}

/** delete_user_meta(). */
export async function deleteMeta(ctx: Ctx, uid: number, key: string): Promise<void> {
  ctx.metaCache.set(uid + "\0" + key, "");
  await ctx.env.DB.prepare("delete from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).run();
}

export const loggedIn = (ctx: Ctx) => ctx.uid > 0;
export const isAdmin = (ctx: Ctx) => !!ctx.user?.roles.includes("administrator");

/** home_url( $path ). */
export const homeUrl = (ctx: Ctx, path = "/") => ctx.origin + "/" + path.replace(/^\/+/, "");
/** admin_url( 'admin-ajax.php' ): the Worker answers the same address. */
export const adminUrl = (ctx: Ctx, path = "") => ctx.origin + "/wp-admin/" + path;

/**
 * wp_create_nonce(): the Worker checks that a POST comes from this site's own
 * pages instead (session.ts sameOrigin), so the token is only a placeholder the
 * page sends back. Kept so the plugin's scripts run unchanged.
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

