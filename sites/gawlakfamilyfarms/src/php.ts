/**
 * PHP and WordPress output helpers, matched byte for byte to what the plugin
 * printed: escaping, number formatting and JSON encoding.
 */

import { escUrlRaw } from "./wpfn";

const ENT: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };

/** esc_html()/esc_attr(): htmlspecialchars(ENT_QUOTES) without double-encoding existing entities. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)|[<>"']/g, (c) => ENT[c] ?? c);
}

/** esc_textarea(): htmlspecialchars(ENT_QUOTES), which DOES re-encode existing entities. */
export const escTextarea = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ENT[c]);

/** esc_url() for display: esc_url_raw()'s rules, then & and ' as entities. */
export function escUrl(v: unknown): string {
  return escUrlRaw(v).replace(/&(?!#038;)/g, "&#038;").replace(/'/g, "&#039;");
}

/** PHP's round() (half away from zero, on the decimal value). */
export function phpRound(v: number, places = 0): number {
  const f = 10 ** places;
  const x = Number((Math.abs(v) * f).toPrecision(15));
  return (Math.sign(v) * Math.round(x)) / f;
}

/** number_format($n, $dp): rounded, comma thousands. */
export function numberFormat(n: number, dp = 0): string {
  const r = phpRound(n, dp);
  const [w, f] = Math.abs(r).toFixed(dp).split(".");
  const s = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dp > 0 ? "." + f : "");
  return r < 0 ? "-" + s : s;
}

/** echo of a PHP float or int. */
export const phpNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(14))));

/** (float) of a PHP string: the leading number, 0 when none. */
export function phpFloat(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const m = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(String(v ?? ""));
  return m ? Number(m[0]) : 0;
}

/** (int) of a PHP value. */
export const phpInt = (v: unknown) => Math.trunc(phpFloat(v));

/** PHP truthiness ('' , '0', 0, null, false and [] are false). */
export const truthy = (v: unknown) =>
  !(v === undefined || v === null || v === false || v === 0 || v === "" || v === "0" || (Array.isArray(v) && v.length === 0));

/**
 * wp_json_encode() with PHP's default flags: "/" escaped and every non-ASCII
 * character as \uXXXX. `flags` takes the JSON_UNESCAPED_* behaviours the
 * plugin asks for.
 */
export function phpJson(v: unknown, flags: { slashes?: boolean; unicode?: boolean } = {}): string {
  let s = JSON.stringify(v, (_k, x) => (x === undefined ? null : x)) ?? "null";
  if (!flags.slashes) s = s.replace(/\//g, "\\/");
  if (!flags.unicode) s = s.replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  return s;
}

/** rawurlencode(): RFC 3986, like encodeURIComponent but also ! ' ( ) *. */
export const rawurlencode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** gmdate() for the formats the plugin uses. */
export function gmdate(format: string, sec: number): string {
  const d = new Date(sec * 1000);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = d.getUTCHours();
  const map: Record<string, string> = {
    l: days[d.getUTCDay()], D: days[d.getUTCDay()].slice(0, 3), F: months[d.getUTCMonth()], M: months[d.getUTCMonth()].slice(0, 3),
    j: String(d.getUTCDate()), d: pad(d.getUTCDate()), Y: String(d.getUTCFullYear()), m: pad(d.getUTCMonth() + 1), n: String(d.getUTCMonth() + 1),
    g: String(h % 12 || 12), G: String(h), H: pad(h), h: pad(h % 12 || 12), i: pad(d.getUTCMinutes()), s: pad(d.getUTCSeconds()),
    a: h < 12 ? "am" : "pm", A: h < 12 ? "AM" : "PM",
  };
  let out = "";
  for (let i = 0; i < format.length; i++) {
    const c = format[i];
    if (c === "\\" && i + 1 < format.length) { out += format[++i]; continue; }
    out += map[c] ?? c;
  }
  return out;
}
