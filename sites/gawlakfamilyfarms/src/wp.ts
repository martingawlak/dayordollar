/**
 * The WordPress pieces the plugin leans on: user meta, options, transients and
 * the wp_send_json_* response shape. Storage is D1; arrays are JSON.
 */
import type { Env } from "./env";

export const ok = (data: unknown = { ok: true }) => Response.json({ success: true, data });
export const fail = (message: string) => Response.json({ success: false, data: { message } });

function decode(v: string | null): unknown {
  if (v == null) return "";
  return v.startsWith("[") || v.startsWith("{") ? JSON.parse(v) : v;
}

export async function getMeta(env: Env, uid: number, key: string): Promise<unknown> {
  const row = await env.DB.prepare("select meta_value from wp_usermeta where user_id = ? and meta_key = ?")
    .bind(uid, key).first<{ meta_value: string | null }>();
  return decode(row?.meta_value ?? null);
}

export async function setMeta(env: Env, uid: number, key: string, value: unknown): Promise<void> {
  const v = typeof value === "string" ? value : JSON.stringify(value);
  await env.DB.prepare(
    "insert into wp_usermeta (user_id, meta_key, meta_value) values (?, ?, ?) " +
      "on conflict (user_id, meta_key) do update set meta_value = excluded.meta_value",
  ).bind(uid, key, v).run();
}

export async function getOption(env: Env, name: string, fallback = ""): Promise<unknown> {
  const row = await env.DB.prepare("select option_value from wp_options where option_name = ?")
    .bind(name).first<{ option_value: string | null }>();
  return row ? decode(row.option_value) : fallback;
}

/** update_option(): arrays and objects are stored as JSON, everything else as text. */
export async function setOption(env: Env, name: string, value: unknown): Promise<void> {
  const v = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  await env.DB.prepare("insert into wp_options (option_name, option_value) values (?, ?) on conflict(option_name) do update set option_value = excluded.option_value").bind(name, v).run();
}

/** A PHP-style associative array read back from JSON: [] (empty PHP array) becomes {}. */
export function assoc<T>(v: unknown): Record<string, T> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {};
}

export async function setTransient(env: Env, name: string, value: string, ttlSeconds: number): Promise<void> {
  await env.DB.prepare(
    "insert into transients (name, value, expires_at) values (?, ?, ?) " +
      "on conflict (name) do update set value = excluded.value, expires_at = excluded.expires_at",
  ).bind(name, value, Math.floor(Date.now() / 1000) + ttlSeconds).run();
}

export async function getTransient(env: Env, name: string): Promise<string | null> {
  const row = await env.DB.prepare("select value from transients where name = ? and expires_at > ?")
    .bind(name, Math.floor(Date.now() / 1000)).first<{ value: string }>();
  return row?.value ?? null;
}

export async function deleteTransient(env: Env, name: string): Promise<void> {
  await env.DB.prepare("delete from transients where name = ?").bind(name).run();
}

/** wp_generate_password( $len, false, false ): letters and digits only. */
export function randomCode(len: number): string {
  const hook = (globalThis as { __gffRandomCode?: (len: number) => string }).__gffRandomCode;
  if (hook) return hook(len); // tests: the same sequence the PHP side is given
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  // Rejection sampling: 248 is the largest multiple of 62 below 256, so every character is equally likely.
  let out = "";
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 248 && out.length < len) out += chars[b % 62];
    }
  }
  return out;
}

export async function sendMail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (env.MAIL_LOG) { env.MAIL_LOG.push({ to, subject, body: text }); return true; }
  if (!env.RESEND_API_KEY || !to) {
    console.log(`[mail not sent: no RESEND_API_KEY] to=${to} subject=${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM ?? "Gawlak Family Farms <hello@gawlakfamilyfarms.com>", to: [to], subject, text }),
  });
  if (!res.ok) console.error("mail failed", res.status, await res.text());
  return res.ok;
}

/** delete_user_meta() */
export async function deleteMeta(env: Env, uid: number, key: string): Promise<void> {
  await env.DB.prepare("delete from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).run();
}

/**
 * current_time('timestamp'): the site's wall clock in seconds — now shifted by
 * the site's UTC offset (its timezone when one is set, else gmt_offset).
 */
export async function currentTimeTs(env: Env, nowMs = Date.now()): Promise<number> {
  const tz = String(await getOption(env, "timezone_string", "")).trim();
  let offsetH = parseFloat(String(await getOption(env, "gmt_offset", "0"))) || 0;
  if (tz) {
    try {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(nowMs)).find((p) => p.type === "timeZoneName")?.value ?? "";
      const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
      offsetH = m ? (m[1] === "-" ? -1 : 1) * (+m[2] + +m[3] / 60) : 0;
    } catch { /* an unknown zone reads as UTC, as WordPress does */ offsetH = 0; }
  }
  return Math.floor(nowMs / 1000) + Math.trunc(offsetH * 3600);
}
