/** WordPress's input sanitizers, as the plugin's handlers rely on them. */

const escHtml = (s: string) => s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)|[<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] ?? c);

/** _sanitize_text_fields(): tags out, a stray < kept as text, %xx octets removed, trimmed. */
function sanitizeText(str: unknown, keepNewlines: boolean): string {
  let f = String(str ?? "");
  if (f.includes("<")) {
    f = f.replace(/<[^>]*?((?=<)|>|$)/g, (m) => (m.endsWith(">") ? m : escHtml(m)));
    f = f.replace(/<(script|style)[^>]*?>[\s\S]*?<\/\1>/gi, "");
    f = f.replace(/<[^>]*>/g, "");
    f = f.replace(/<\n/g, "&lt;\n");
  }
  if (!keepNewlines) f = f.replace(/[\r\n\t ]+/g, " ");
  f = f.trim();
  let found = false, m: RegExpExecArray | null;
  while ((m = /%[a-f0-9]{2}/i.exec(f))) { f = f.split(m[0]).join(""); found = true; }
  if (found) f = f.replace(/ +/g, " ").trim();
  return f;
}
/** sanitize_text_field() */
export const sanitizeTextField = (s: unknown) => sanitizeText(s, false);
/** sanitize_textarea_field(): the same, keeping line breaks. */
export const sanitizeTextareaField = (s: unknown) => sanitizeText(s, true);

/** sanitize_key(): lowercase letters, digits, dashes and underscores. */
export const sanitizeKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");

const PROTOCOLS = ["http", "https", "ftp", "ftps", "mailto", "news", "irc", "irc6", "ircs", "gopher", "nntp", "feed", "telnet", "mms", "rtsp", "sms", "svn", "tel", "fax", "xmpp", "webcal", "urn"];

/** esc_url_raw(): WordPress's cleaning, without the display-only &-encoding. "" when refused. */
export function escUrlRaw(raw: unknown, protocols = PROTOCOLS): string {
  let url = String(raw ?? "").replace(/^\s+/, "").replace(/ /g, "%20");
  url = url.replace(/[^a-z0-9\-~+_.?#=!&;,/:%@$|*'()[\]\x80-\xffĀ-￿]/gi, "");
  if (url === "") return url;
  if (!/^mailto:/i.test(url)) { let before; do { before = url; url = url.replace(/%0d|%0a|%0D|%0A/g, ""); } while (before !== url); }
  url = url.replace(/;\/\//g, "://");
  if (!url.includes(":") && !["/", "#", "?"].includes(url[0]) && !/^[a-z0-9-]+?\.php/i.test(url)) url = "http://" + url;
  if (url[0] === "/") return url;
  const m = /^([^:/?#]+):/.exec(url);
  if (m && !protocols.includes(m[1].toLowerCase())) return "";
  return url;
}

/** parse_url($url, PHP_URL_HOST): the host of an absolute URL, or "" (PHP's rules, not the browser's). */
export function urlHost(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
  if (!m) return "";
  let auth = m[1];
  const at = auth.lastIndexOf("@");
  if (at >= 0) auth = auth.slice(at + 1);
  if (auth.startsWith("[")) { const end = auth.indexOf("]"); return end > 0 ? auth.slice(0, end + 1) : ""; }
  const colon = auth.lastIndexOf(":");
  if (colon >= 0 && /^\d*$/.test(auth.slice(colon + 1))) auth = auth.slice(0, colon);
  return auth;
}

const LOCAL_OK = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const trimSet = (s: string, chars: string) => { let a = 0, b = s.length; while (a < b && chars.includes(s[a])) a++; while (b > a && chars.includes(s[b - 1])) b--; return s.slice(a, b); };
const WS = " \t\n\r\0\x0B";

/** is_email(): WordPress's own rules. */
export function isEmail(raw: unknown): boolean {
  const email = String(raw ?? "");
  if (email.length < 6 || email.indexOf("@", 1) < 0) return false;
  const at = email.indexOf("@"), local = email.slice(0, at), domain = email.slice(at + 1);
  if (!LOCAL_OK.test(local)) return false;
  if (/\.{2,}/.test(domain) || trimSet(domain, WS + ".") !== domain) return false;
  const subs = domain.split(".");
  if (subs.length < 2) return false;
  return subs.every((sub) => trimSet(sub, WS + "-") === sub && /^[a-z0-9-]+$/i.test(sub));
}

/** sanitize_email(): WordPress's cleaning; "" when nothing usable is left. */
export function sanitizeEmail(raw: unknown): string {
  const email = String(raw ?? "");
  if (email.length < 6 || email.indexOf("@", 1) < 0) return "";
  const at = email.indexOf("@");
  const local = email.slice(0, at).replace(/[^a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]/g, "");
  if (local === "") return "";
  let domain = email.slice(at + 1).replace(/\.{2,}/g, "");
  if (domain === "") return "";
  domain = trimSet(domain, WS + ".");
  if (domain === "") return "";
  const subs = domain.split(".");
  if (subs.length < 2) return "";
  const parts = subs.map((sub) => trimSet(sub, WS + "-").replace(/[^a-z0-9-]+/gi, "")).filter((sub) => sub !== "");
  return parts.length < 2 ? "" : local + "@" + parts.join(".");
}

/**
 * strtotime() for what date and datetime-local inputs send: "YYYY-MM-DD",
 * optionally with "T" or " " and H:MM[:SS], read as UTC (WordPress runs PHP in
 * UTC). Out-of-range days roll over as PHP's do; anything else is null (false).
 */
export function strtotime(raw: string): number | null {
  const m = /^\s*(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[T ]([01]?\d|2[0-4]):([0-5]\d)(?::([0-5]\d|60))?)?\s*$/.exec(raw);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) / 1000);
}

/** remove_accents() for the letters NFKD does not split into base + accent. */
const ACCENT_MAP: Record<string, string> = { ß: "ss", æ: "ae", Æ: "AE", ø: "o", Ø: "O", đ: "d", Đ: "D", ł: "l", Ł: "L", œ: "oe", Œ: "OE", þ: "th", Þ: "TH", ð: "d", Ð: "D", ı: "i" };

/**
 * sanitize_title() when saving a new slug: remove_accents(), then
 * sanitize_title_with_dashes(..., 'save') — tags out, other non-ASCII
 * percent-encoded, dashes and dots become separators, entities dropped.
 */
export function sanitizeTitleSave(raw: string): string {
  let t = String(raw ?? "").replace(/<[^>]*>/g, "");
  t = t.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[ßæÆøØđĐłŁœŒþÞðÐı]/g, (c) => ACCENT_MAP[c]);
  // Keep existing %xx octets, drop any other "%".
  t = t.replace(/%([a-fA-F0-9]{2})/g, "---$1---").replace(/%/g, "").replace(/---([a-fA-F0-9]{2})---/g, "%$1");
  t = t.toLowerCase();
  // Non-ASCII that survived becomes its UTF-8 octets (utf8_uri_encode), lowercased.
  t = t.replace(/[^\x00-\x7f]/gu, (c) => encodeURIComponent(c).toLowerCase());
  // 'save': no-break space, en and em dash read as separators; × as x; quotes and the like go.
  t = t.replace(/%c2%a0|%e2%80%93|%e2%80%94|&nbsp;|&#160;|&ndash;|&#8211;|&mdash;|&#8212;/g, "-");
  t = t.replace(/%c3%97/g, "x");
  t = t.replace(/%c2%a1|%c2%bf|%c2%ab|%c2%bb|%e2%80%b9|%e2%80%ba|%e2%80%98|%e2%80%99|%e2%80%9c|%e2%80%9d|%e2%80%9a|%e2%80%9b|%e2%80%9e|%e2%80%9f|%e2%80%a2|%c2%a9|%c2%ae|%c2%b0|%e2%80%a6|%e2%84%a2|%c2%b4|%cb%8a|%cc%81|%cd%81|%cc%80|%cc%84|%cc%8c|%e2%80%8b|%e2%80%8c|%e2%80%8d|%e2%80%8e|%e2%80%8f|%e2%80%aa|%e2%80%ab|%e2%80%ac|%e2%80%ad|%e2%80%ae|%ef%bb%bf|%ef%bf%bc/g, "");
  t = t.replace(/&.+?;/g, "").replace(/\./g, "-").replace(/[^%a-z0-9 _-]/g, "");
  return t.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
