/**
 * The WordPress core pieces the plugin calls beyond options and meta: wp_mail(),
 * users (get_user_by, username_exists, sanitize_user, wp_insert_user,
 * wp_update_user, wp_delete_user, roles), current_time(), mysql2date(),
 * add_query_arg(), wp_get_referer(), fputcsv(), and the reply shapes
 * admin-post.php gave (a redirect, a streamed file, wp_die()).
 * wp_insert_user() stores no password: sign-in is the shared accounts service.
 */
import type { Env } from "./env";
import { type Ctx, loadUser, opt, setMeta, type User } from "./ctx";
import { gmdate } from "./php";
import { strtotime } from "./wpfn";
import { Reply, type AjaxCtx } from "./ajax";

/**
 * wp_mail( $to, $subject, $body, $headers ). The plugin sends plain text with no headers; a
 * "Content-Type: text/html" header would send HTML and a "Reply-To:" header the reply address.
 * Sent through Resend when its key is set, else Cloudflare Email Sending, from the brand's name
 * at the company domain (EMAIL_FROM_NAME / EMAIL_FROM_ADDRESS), replies to EMAIL_REPLY_TO.
 */
export async function sendMail(env: Env, to: string, subject: string, body: string, headers: string | string[] = ""): Promise<boolean> {
  if (env.MAIL_LOG) { env.MAIL_LOG.push({ to, subject, body, headers }); return true; }
  const lines = (Array.isArray(headers) ? headers : String(headers).split(/\r?\n/)).map((h) => h.trim()).filter(Boolean);
  const html = lines.some((h) => /^content-type:\s*text\/html/i.test(h));
  const replyTo = lines.find((h) => /^reply-to:/i.test(h))?.replace(/^reply-to:\s*/i, "") ?? env.EMAIL_REPLY_TO;
  const fromAddress = env.EMAIL_FROM_ADDRESS ?? "fppm@martingawlakcompany.com", fromName = env.EMAIL_FROM_NAME ?? "Fort Pierce Purple Martins";
  if (!to) return false;
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromAddress}>`, to: [to], subject, ...(html ? { html: body } : { text: body }), ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) console.error("mail failed", res.status, await res.text());
    return res.ok;
  }
  if (!env.EMAIL) {
    console.log(`[mail not sent: no RESEND_API_KEY or email binding] to=${to} subject=${subject}`);
    return false;
  }
  try {
    await env.EMAIL.send({ to, from: { email: fromAddress, name: fromName }, subject, ...(html ? { html: body } : { text: body }), ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (e) {
    console.error("mail failed", e);
    return false;
  }
}

/** A WP_Error: its code and message. */
export class WPError { constructor(public code: string, public message: string) {} }
export const isWPError = (v: unknown): v is WPError => v instanceof WPError;

/** get_user_by( 'email' | 'login', $v ). MySQL compared these case-insensitively. */
export async function getUserBy(c: Ctx, field: "email" | "login", v: string): Promise<User | null> {
  const col = field === "email" ? "email" : "login";
  const r = await c.env.DB.prepare(`select id from wp_users where ${col} = ? collate nocase order by id limit 1`).bind(String(v)).first<{ id: number }>();
  return r ? loadUser(c.env, r.id) : null;
}
export const usernameExists = async (c: Ctx, login: string) => (await getUserBy(c, "login", login))?.ID ?? false;
export const emailExists = async (c: Ctx, email: string) => (await getUserBy(c, "email", email))?.ID ?? false;

/** sanitize_user( $username, $strict ). remove_accents() is a no-op on what the plugin passes (sanitize_email()'d ASCII). */
export function sanitizeUser(username: string, strict = false): string {
  let u = String(username).replace(/<[^>]*>/g, "");
  u = u.replace(/%[a-fA-F0-9][a-fA-F0-9]/g, "").replace(/&.+?;/g, "");
  if (strict) u = u.replace(/[^a-z0-9 _.\-@]/gi, "");
  return u.trim().replace(/\s+/g, " ");
}

export interface NewUser { user_login: string; user_email: string; first_name?: string; last_name?: string; display_name?: string; role?: string }

/** wp_insert_user() for a new user: the new id, or WordPress's error. No password (MIGRATION.md). */
export async function insertUser(c: Ctx, d: NewUser): Promise<number | WPError> {
  const login = sanitizeUser(d.user_login ?? "", true).trim();
  if (login === "") return new WPError("empty_user_login", "Cannot create a user with an empty login name.");
  if (Array.from(login).length > 60) return new WPError("user_login_too_long", "Username may not be longer than 60 characters.");
  if (await usernameExists(c, login)) return new WPError("existing_user_login", "Sorry, that username already exists!");
  const email = String(d.user_email ?? "");
  if (email !== "" && (await emailExists(c, email))) return new WPError("existing_user_email", "Sorry, that email address is already used!");
  const display = d.display_name ? d.display_name : login;
  const r = await c.env.DB.prepare("insert into wp_users (id, login, email, display_name, registered, roles) values ((select coalesce(max(id), 0) + 1 from wp_users), ?, ?, ?, ?, ?) returning id")
    .bind(login, email, display, gmdate("Y-m-d H:i:s", c.now), JSON.stringify([d.role ?? String(opt(c, "default_role", "subscriber"))])).first<{ id: number }>();
  const id = r!.id;
  await setMeta(c, id, "first_name", d.first_name ?? "");
  await setMeta(c, id, "last_name", d.last_name ?? "");
  return id;
}

/** wp_update_user( ID, first_name, last_name, display_name ). */
export async function updateUserNames(c: Ctx, uid: number, first: string, last: string, display: string): Promise<void> {
  await c.env.DB.prepare("update wp_users set display_name = ? where id = ?").bind(display, uid).run();
  await setMeta(c, uid, "first_name", first);
  await setMeta(c, uid, "last_name", last);
  if (c.user && c.user.ID === uid) c.user.display_name = display;
}

/** WP_User::add_role(). */
export async function addRole(c: Ctx, uid: number, role: string): Promise<void> {
  const u = await loadUser(c.env, uid);
  if (!u || u.roles.includes(role)) return;
  u.roles.push(role);
  await c.env.DB.prepare("update wp_users set roles = ? where id = ?").bind(JSON.stringify(u.roles), uid).run();
  if (c.user && c.user.ID === uid) c.user.roles = u.roles;
}

/** wp_delete_user(): the user and their meta (members own no posts). */
export async function deleteUser(c: Ctx, uid: number): Promise<void> {
  await c.env.DB.prepare("delete from wp_usermeta where user_id = ?").bind(uid).run();
  await c.env.DB.prepare("delete from wp_users where id = ?").bind(uid).run();
  for (const k of [...c.metaCache.keys()]) if (k.startsWith(uid + "\0")) c.metaCache.delete(k);
}

/** The site's UTC offset in seconds at a moment: its timezone_string when set, else gmt_offset. */
export function siteOffset(c: Ctx, at = c.now): number {
  const tz = String(opt(c, "timezone_string", "") ?? "").trim();
  let off = Number.parseFloat(String(opt(c, "gmt_offset", 0) ?? 0)) || 0;
  if (tz) {
    try {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(at * 1000)).find((p) => p.type === "timeZoneName")?.value ?? "";
      const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
      off = m ? (m[1] === "-" ? -1 : 1) * (+m[2] + +m[3] / 60) : 0;
    } catch { off = 0; }
  }
  return Math.trunc(off * 3600);
}
/** current_time( 'timestamp' ). */
export const currentTs = (c: Ctx) => c.now + siteOffset(c);
/** current_time( 'mysql' ). */
export const currentMysql = (c: Ctx) => gmdate("Y-m-d H:i:s", currentTs(c));

/** mysql2date( $format, $date ): a stored site-time date, formatted as it reads (false for none). */
export function mysql2date(format: string, date: unknown): string | false {
  if (date === null || date === undefined || date === "" || date === false) return false;
  const t = strtotime(String(date));
  return t === null ? false : gmdate(format, t);
}

/** PHP's urlencode(). */
export const urlencode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()*~]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());

/** http_build_query( $args ) for a flat array of strings. */
export const httpBuildQuery = (args: Record<string, string>) => Object.entries(args).map(([k, v]) => urlencode(k) + "=" + urlencode(v)).join("&");

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
/** add_query_arg( $args, $url ): WordPress's algorithm (existing values re-encoded, new ones added as given; false removes). */
export function addQueryArg(args: Record<string, string | number | false>, uri: string): string {
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
  const merged: Record<string, string | false> = {};
  for (const [k, v] of Object.entries(parseStr(query))) merged[k] = Object.prototype.hasOwnProperty.call(args, k) ? (args[k] === false ? false : String(args[k])) : urlencode(v);
  for (const [k, v] of Object.entries(args)) if (!Object.prototype.hasOwnProperty.call(merged, k)) merged[k] = v === false ? false : String(v);
  let ret = Object.entries(merged).filter(([, v]) => v !== false).map(([k, v]) => k + "=" + v).join("&").replace(/^\?+|\?+$/g, "");
  ret = ret.replace(/=(&|$)/g, "$1");
  ret = (protocol + base + ret + frag).replace(/\?+$/, "");
  return ret.replace("?#", "#");
}
/** remove_query_arg( $key, $url ). */
export const removeQueryArg = (key: string, uri: string) => addQueryArg({ [key]: false }, uri);

/** wp_get_referer(): the posted _wp_http_referer or the Referer header, unless it is this request or another site's. */
export function getReferer(c: AjaxCtx & { referer?: string }, requestUri = "/wp-admin/admin-post.php"): string | false {
  const posted = c.post._wp_http_referer ?? c.get._wp_http_referer;
  const ref = typeof posted === "string" && posted !== "" ? posted : c.referer ?? "";
  if (!ref || ref === requestUri || ref === c.origin + requestUri) return false;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]*)/i.exec(ref);
  if (!m) return ref;
  return m[1] === new URL(c.origin).hostname ? ref : false;
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
  constructor(public to: string, public cookies: string[] = []) { super({ redirect: to }); }
  toResponse(): Response {
    const h = new Headers({ location: this.to });
    for (const k of this.cookies) h.append("set-cookie", k);
    return new Response(null, { status: 302, headers: h });
  }
}
/** A streamed file (the CSV exports, the .ics): its headers and body, as the plugin printed them, then exit. */
export class FileReply extends Reply {
  constructor(public headers: string[], public text: string, public statusCode = 200) { super({ exit: true, headers, body: text }); }
  toResponse(): Response {
    const h = new Headers({ "Cache-Control": "no-cache, must-revalidate, max-age=0, no-store, private", Expires: "Wed, 11 Jan 1984 05:00:00 GMT" });
    for (const line of this.headers) { const i = line.indexOf(":"); h.set(line.slice(0, i).trim(), line.slice(i + 1).trim()); }
    return new Response(this.text, { status: this.statusCode, headers: h });
  }
}
/** wp_die( $message ): WordPress's error page (the bench compares the message). */
export class DieReply extends Reply {
  constructor(public message: string) { super({ die: message }, 500); }
  toResponse(): Response {
    const html = '<!DOCTYPE html><html lang="en-US"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,follow"><title>FPPM &rsaquo; Error</title>'
      + "<style>body{background:#fff;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1e1e1e;max-width:700px;margin:2em auto;padding:1em 2em;border:1px solid #ddd}</style></head>"
      + '<body id="error-page"><div class="wp-die-message">' + this.message + "</div></body></html>";
    return new Response(html, { status: 500, headers: { "content-type": "text/html; charset=UTF-8" } });
  }
}
