/**
 * The WordPress core pieces the plugin calls beyond options and meta: users
 * (get_user_by, username_exists, sanitize_user, wp_insert_user), the admin's
 * new-user email, and current_time(). Same rules and messages as WordPress;
 * wp_insert_user() stores no password (sign-in is the shared accounts
 * service, see MIGRATION.md).
 */
import { type Ctx, loadUser, opt, setMeta, type User } from "./ctx";
import { gmdate } from "./php";
import { sendMail } from "./wp";

/** A WP_Error: its code and message. */
export class WPError { constructor(public code: string, public message: string) {} }
export const isWPError = (v: unknown): v is WPError => v instanceof WPError;

/** get_user_by( 'email' | 'login' | 'id', $v ). MySQL compared these case-insensitively. */
export async function getUserBy(c: Ctx, field: "email" | "login" | "id", v: string | number): Promise<User | null> {
  if (field === "id") return loadUser(c.env, Number(v) || 0);
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

/** wp_insert_user() for a new user: the new id, or WordPress's error. */
export async function insertUser(c: Ctx, d: NewUser): Promise<number | WPError> {
  const login = sanitizeUser(d.user_login ?? "", true).trim();
  if (login === "") return new WPError("empty_user_login", "Cannot create a user with an empty login name.");
  if (Array.from(login).length > 60) return new WPError("user_login_too_long", "Username may not be longer than 60 characters.");
  if (await usernameExists(c, login)) return new WPError("existing_user_login", "Sorry, that username already exists!");
  const email = String(d.user_email ?? "");
  if (email !== "" && (await emailExists(c, email))) return new WPError("existing_user_email", "Sorry, that email address is already used!");
  const display = d.display_name ? d.display_name : login;
  const r = await c.env.DB.prepare("insert into wp_users (login, email, display_name, registered, roles) values (?, ?, ?, ?, ?) returning id")
    .bind(login, email, display, gmdate("Y-m-d H:i:s", c.now), JSON.stringify([d.role ?? "subscriber"])).first<{ id: number }>();
  const id = r!.id;
  await setMeta(c, id, "first_name", d.first_name ?? "");
  await setMeta(c, id, "last_name", d.last_name ?? "");
  return id;
}

/** wp_specialchars_decode( $s, ENT_QUOTES ). */
const specialcharsDecode = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#0*39|#x0*27);/gi, (m, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"' } as Record<string, string>)[e.toLowerCase()] ?? "'");

/** wp_new_user_notification( $id, null, 'admin' ): WordPress's email telling the admin. */
export async function newUserNotification(c: Ctx, id: number, notify = ""): Promise<void> {
  const u = await loadUser(c.env, id);
  if (!u) return;
  const blogname = specialcharsDecode(String(opt(c, "blogname", "")));
  if (notify !== "user") {
    const m = `New user registration on your site ${blogname}:\r\n\r\nUsername: ${u.user_login}\r\n\r\nEmail: ${u.user_email}\r\n`;
    await sendMail(c.env, String(opt(c, "admin_email", "")), `[${blogname}] New User Registration`, m, "");
  }
}

/** current_time( 'timestamp' ): now shifted to the site's clock (its timezone, else gmt_offset). */
export function currentTs(c: Ctx): number {
  const tz = String(opt(c, "timezone_string", "") ?? "").trim();
  let off = Number.parseFloat(String(opt(c, "gmt_offset", 0) ?? 0)) || 0;
  if (tz) {
    try {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(c.now * 1000)).find((p) => p.type === "timeZoneName")?.value ?? "";
      const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
      off = m ? (m[1] === "-" ? -1 : 1) * (+m[2] + +m[3] / 60) : 0;
    } catch { off = 0; }
  }
  return c.now + Math.trunc(off * 3600);
}
/** current_time( 'mysql' ). */
export const currentMysql = (c: Ctx) => gmdate("Y-m-d H:i:s", currentTs(c));
