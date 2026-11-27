/**
 * The WordPress pieces the client admin leans on, matched to WordPress's own
 * behaviour: capabilities, users by role, the referer, add_query_arg(),
 * human_time_diff(), mysql2date(), wp_hash(), wp_trim_words(), fputcsv(), and
 * the reply shapes admin-post.php gave (a redirect, a streamed file, wp_die()).
 */
import { type AjaxCtx, Reply } from "../ajax";
import { type Ctx, loadUser, meta, type User } from "../ctx";
import { gmdate } from "../php";
import { strtotime } from "../wpfn";

/** A request to an admin screen or admin-post.php: the form, and the page it came from. */
export interface AdminCtx extends AjaxCtx { referer?: string }

/**
 * The site's roles and the capabilities the plugin checks, as svz_user_roles
 * holds them on the live site (administrator has them all; gff_staff has
 * gff_view_clients; shop_manager has list_users; every other role only read).
 */
const ROLE_CAPS: Record<string, string[]> = {
  administrator: ["read", "list_users", "manage_options", "edit_users", "delete_users", "gff_view_clients"],
  gff_staff: ["read", "gff_view_clients"],
  shop_manager: ["read", "list_users"],
};

/** user_can() / current_user_can(): 'edit_user' on oneself needs nothing (map_meta_cap), on anyone else edit_users. */
export function userCan(u: User | null, cap: string, arg?: number): boolean {
  if (!u) return false;
  if (cap === "edit_user" && arg !== undefined && arg === u.ID) return true;
  if (cap === "edit_user") cap = "edit_users";
  return u.roles.some((r) => (ROLE_CAPS[r] ?? ["read"]).includes(cap));
}
export const can = (c: Ctx, cap: string, arg?: number) => userCan(c.user, cap, arg);
/** gff_can_manage_clients(): staff and admins. */
export const canManageClients = (c: Ctx) => can(c, "gff_view_clients") || can(c, "manage_options");

/** get_users( role__in, orderby, order, meta_key/meta_value, number ) — ties by id. */
export async function getUsers(c: Ctx, a: { role__in?: string[]; orderby?: "registered" | "display_name"; order?: "ASC" | "DESC"; meta_key?: string; meta_value?: string; number?: number } = {}): Promise<User[]> {
  const col = a.orderby === "registered" ? "registered" : a.orderby === "display_name" ? "display_name collate nocase" : "login collate nocase";
  const rows = await c.env.DB.prepare(`select id from wp_users order by ${col} ${a.order === "DESC" ? "desc" : "asc"}, id asc`).all<{ id: number }>();
  const out: User[] = [];
  for (const r of rows.results) {
    const u = await loadUser(c.env, r.id);
    if (!u) continue;
    if (a.role__in && !u.roles.some((x) => a.role__in!.includes(x))) continue;
    if (a.meta_key) {
      const mv = await meta(c, u.ID, a.meta_key);
      if (mv === "" || (a.meta_value !== undefined && mv !== a.meta_value)) continue;
    }
    out.push(u);
    if (a.number && out.length >= a.number) break;
  }
  return out;
}
/** wp_users.registered for a user (the WP_User's user_registered). */
export async function registeredOf(c: Ctx, uid: number): Promise<string> {
  const r = await c.env.DB.prepare("select registered from wp_users where id = ?").bind(uid).first<{ registered: string }>();
  return r?.registered ?? "";
}

/** WP_User::add_role / remove_role: the roles list in its stored order. */
export async function addRole(c: Ctx, u: User, role: string): Promise<void> {
  if (!u.roles.includes(role)) u.roles = [...u.roles, role];
  await c.env.DB.prepare("update wp_users set roles = ? where id = ?").bind(JSON.stringify(u.roles), u.ID).run();
}
export async function removeRole(c: Ctx, u: User, role: string): Promise<void> {
  u.roles = u.roles.filter((r) => r !== role);
  await c.env.DB.prepare("update wp_users set roles = ? where id = ?").bind(JSON.stringify(u.roles), u.ID).run();
}
/** wp_delete_user(): the user and their meta. */
export async function deleteUser(c: Ctx, uid: number): Promise<void> {
  await c.env.DB.prepare("delete from wp_usermeta where user_id = ?").bind(uid).run();
  await c.env.DB.prepare("delete from wp_users where id = ?").bind(uid).run();
  for (const k of [...c.metaCache.keys()]) if (k.startsWith(uid + "\0")) c.metaCache.delete(k);
}

/** wp_get_referer(): the posted _wp_http_referer or the Referer header, unless it is this request or another site's. */
export function getReferer(c: AdminCtx, requestUri = "/wp-admin/admin-post.php"): string | false {
  const posted = c.post._wp_http_referer;
  const ref = typeof posted === "string" && posted !== "" && posted !== "0" ? posted : c.referer ?? "";
  if (!ref || ref === requestUri || ref === c.origin + requestUri) return false;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]*)/i.exec(ref);
  if (!m) return ref;
  return m[1] === new URL(c.origin).hostname ? ref : false;
}

/** PHP's urlencode(). */
const urlencode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()*~]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
/** parse_str() for a flat query (lists are not used here). */
function parseStr(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    if (part === "") continue;
    const i = part.indexOf("=");
    const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, " ")); } catch { return x; } };
    const k = dec(i < 0 ? part : part.slice(0, i));
    if (k === "") continue;
    out[k] = dec(i < 0 ? "" : part.slice(i + 1));
  }
  return out;
}
/** add_query_arg( $args, $url ): WordPress's algorithm (existing values re-encoded, new ones added as given). */
export function addQueryArg(args: Record<string, string | number>, uri: string): string {
  let frag = "";
  const h = uri.indexOf("#");
  if (h >= 0) { frag = uri.slice(h); uri = uri.slice(0, h); }
  let protocol = "";
  if (/^http:\/\//i.test(uri)) { protocol = "http://"; uri = uri.slice(7); }
  else if (/^https:\/\//i.test(uri)) { protocol = "https://"; uri = uri.slice(8); }
  let base: string, query: string;
  if (uri.includes("?")) { const i = uri.indexOf("?"); base = uri.slice(0, i + 1); query = uri.slice(i + 1); }
  else if (protocol || !uri.includes("=")) { base = uri + "?"; query = ""; }
  else { base = ""; query = uri; }
  // PHP arrays keep a replaced key in its old place.
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(parseStr(query))) merged[k] = Object.prototype.hasOwnProperty.call(args, k) ? String(args[k]) : urlencode(v);
  for (const [k, v] of Object.entries(args)) if (!Object.prototype.hasOwnProperty.call(merged, k)) merged[k] = String(v);
  let ret = Object.entries(merged).map(([k, v]) => k + "=" + v).join("&").replace(/^\?+|\?+$/g, "");
  ret = ret.replace(/=(&|$)/g, "$1");
  ret = (protocol + base + ret + frag).replace(/\?+$/, "");
  return ret.replace("?#", "#");
}

/** human_time_diff( $from, $to ). */
export function humanTimeDiff(from: number, to: number): string {
  const diff = Math.abs(to - from);
  const r = (n: number) => Math.max(1, Math.round(n));
  const pl = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
  if (diff < 3600) return pl(r(diff / 60), "min", "mins");
  if (diff < 86400) return pl(r(diff / 3600), "hour", "hours");
  if (diff < 604800) return pl(r(diff / 86400), "day", "days");
  if (diff < 2592000) return pl(r(diff / 604800), "week", "weeks");
  if (diff < 31536000) return pl(r(diff / 2592000), "month", "months");
  return pl(r(diff / 31536000), "year", "years");
}

/** strtotime() of a stored 'Y-m-d H:i:s' (PHP runs in UTC); null when unreadable. */
export const mysqlTs = (s: unknown) => (s === null || s === undefined || s === "" ? null : strtotime(String(s)));
/** mysql2date( $format, $date ): the stored local time, formatted. */
export function mysql2date(format: string, date: unknown): string | false {
  const t = mysqlTs(date);
  return t === null ? false : gmdate(format, t);
}

/** wp_trim_words( $text, $num, $more ). */
export function trimWords(text: string, num: number, more: string): string {
  const stripped = text.replace(/<(script|style)[^>]*?>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "").trim();
  const words = stripped.split(/[\n\r\t ]+/).filter((w) => w !== "");
  if (words.length > num) return words.slice(0, num).join(" ") + more;
  return words.join(" ");
}

/** fputcsv(): PHP's quoting (a field with a delimiter, quote, space, tab, newline or backslash is quoted; quotes doubled unless escaped by \). */
export function csvLine(fields: unknown[]): string {
  return fields.map((f) => {
    const s = f === null || f === undefined || f === false ? "" : f === true ? "1" : String(f);
    if (!/[,"\n\r\t \\]/.test(s)) return s;
    let o = '"', esc = false;
    for (const ch of s) {
      if (esc) { o += ch; esc = false; continue; }
      if (ch === "\\") { o += ch; esc = true; continue; }
      o += ch === '"' ? '""' : ch;
    }
    return o + '"';
  }).join(",") + "\n";
}


/** wp_safe_redirect() + exit: admin-post.php's answer. */
export class RedirectReply extends Reply {
  constructor(public to: string) { super({ redirect: to }); }
  toResponse(): Response { return new Response(null, { status: 302, headers: { location: this.to } }); }
}
/** A streamed file (the CSV exports): its headers and body, as the plugin printed them, then exit. */
export class FileReply extends Reply {
  constructor(public headers: string[], public text: string) { super({ exit: true, headers, body: text }); }
  toResponse(): Response {
    const h = new Headers({ "Cache-Control": "no-cache, must-revalidate, max-age=0, no-store, private", Expires: "Wed, 11 Jan 1984 05:00:00 GMT" });
    for (const line of this.headers) { const i = line.indexOf(":"); h.set(line.slice(0, i).trim(), line.slice(i + 1).trim()); }
    return new Response(this.text, { headers: h });
  }
}
