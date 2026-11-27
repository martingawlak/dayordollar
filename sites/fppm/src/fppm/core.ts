/**
 * fppm-team-manager 0.10.17, sections 2–6: configuration read from the
 * settings, the member types and player statuses, capabilities, the dues log,
 * small utilities, the flash notice, the redirect helper, the style block and
 * the PayPal button. Each function is the plugin's function of the same name
 * (fppm_x → x in camelCase), with the same output byte for byte.
 */
import { type Ctx, can, homeUrl, meta, opt, setMeta, setOpt, userCan, loadUser } from "../ctx";
import { esc, escUrl, numberFormat, phpFloat, phpInt, truthy } from "../php";
import { escUrlRaw, sanitizeEmail, sanitizeKey, sanitizeTextField } from "../wpfn";
import { currentMysql, addQueryArg, removeQueryArg, getReferer, RedirectReply } from "../wp";
import type { AjaxCtx } from "../ajax";
import { FPPM_STYLES, WAIVER_PARTS } from "./templates.gen";

export const FPPM_VER = "0.10.17";

/** (string) of a stored value: arrays read "Array" as PHP would print them. */
export const str = (v: unknown): string => (v === null || v === undefined || v === false ? "" : v === true ? "1" : typeof v === "object" ? "Array" : String(v));
export const isArr = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object";
/** PHP's trim() (spaces, tabs, newlines, NUL, vertical tab). */
export const trim = (s: string) => s.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");

/* ---- 2. Config ---- */
export const teamName = (c: Ctx) => str(opt(c, "fppm_team_name", "Fort Pierce Purple Martins"));
export const teamCity = (c: Ctx) => str(opt(c, "fppm_team_city", "Fort Pierce, FL"));
export function joinIntro(c: Ctx): string {
  const t = opt(c, "fppm_join_intro", "");
  if (typeof t === "string" && trim(t) !== "") return t;
  return "We're building Fort Pierce's team on a culture of abundance — and there's a place here for everyone. Back the club as a fan, chase the game as a player, or power it forward as a supporter. Free to start; takes a minute.";
}
export function notifyEmail(c: Ctx): string {
  const o = opt(c, "fppm_notify_email", "");
  return truthy(o) ? sanitizeEmail(str(o)) : str(opt(c, "admin_email", false));
}
export const pricePlayerDues = (c: Ctx) => phpFloat(opt(c, "fppm_price_player_dues", 10));
export const priceSupporterMin = (c: Ctx) => phpFloat(opt(c, "fppm_price_supporter_min", 25));
export const priceTshirt = (c: Ctx) => phpFloat(opt(c, "fppm_price_tshirt", 25));
export const priceEmbroidery = (c: Ctx) => phpFloat(opt(c, "fppm_price_embroidery", 5));
export const priceTshirtEmb = (c: Ctx) => priceTshirt(c) + priceEmbroidery(c);
export function collective(c: Ctx): string {
  const v = trim(str(opt(c, "fppm_collective", "")));
  return truthy(v) ? v : "Litty Committee";
}
export const couponPercent = (c: Ctx) => phpFloat(opt(c, "fppm_coupon_percent", 10));
export function couponIssued(c: Ctx): string[] {
  const l = opt(c, "fppm_coupon_codes", []);
  return Array.isArray(l) ? l.map(str) : isArr(l) ? Object.values(l).map(str) : [];
}
export function supporterPool(c: Ctx): string[] {
  const raw = str(opt(c, "fppm_supporter_code_pool", ""));
  return raw.split(/[\s,]+/).map(trim).filter(truthy);
}
export const sharedPromo = (c: Ctx) => trim(str(opt(c, "fppm_shared_promo", "")));
export function makeMemberCode(first: string, last: string, n: number): string {
  let fi = first.replace(/[^A-Za-z]/g, "").toUpperCase(), li = last.replace(/[^A-Za-z]/g, "").toUpperCase();
  fi = fi !== "" ? fi[0] : "X";
  li = li !== "" ? li[0] : "X";
  return "FPPM" + fi + li + Math.trunc(n) + "10";
}
/** fppm_assign_member_code(): once per member — a pool code, else the shared code, else FPPM + initials + member count + 10. */
export async function assignMemberCode(c: Ctx, uid: number, first = "", last = ""): Promise<string> {
  const ex = await meta(c, uid, "fppm_coupon");
  if (truthy(ex)) return str(ex);
  const issued = couponIssued(c);
  const avail = supporterPool(c).filter((x) => !issued.includes(x));
  let code: string;
  if (avail.length) code = avail[0];
  else if (truthy(sharedPromo(c))) code = sharedPromo(c);
  else {
    code = makeMemberCode(first, last, await memberCount(c));
    const base = code;
    let i = 0;
    while (couponIssued(c).includes(code)) { i++; code = base + String.fromCharCode(64 + i); }
  }
  await setMeta(c, uid, "fppm_coupon", code);
  const list = couponIssued(c);
  if (!list.includes(code)) { list.push(code); await setOpt(c, "fppm_coupon_codes", list); }
  return code;
}
/** fppm_pp_link(): a pasted PayPal link, cleaned, or '' (not wired up yet). */
export function ppLink(c: Ctx, key: string): string {
  const v = opt(c, key, "");
  const s = typeof v === "string" ? trim(v) : "";
  return truthy(s) ? escUrlRaw(s) : "";
}

export interface ApparelItem { key: string; label: string; desc: string; price: number; url: string; wc_id: number; pp_key: string; emb?: number; emb_id?: number }
export function apparelItems(c: Ctx): ApparelItem[] {
  const items: ApparelItem[] = [{ key: "tshirt", label: "Purple Martins T-Shirt", desc: "Official team tee — purple with the martin crest.", price: priceTshirt(c), url: tshirtUrl(c), wc_id: phpInt(opt(c, "fppm_wc_tshirt_id", 0)), pp_key: "fppm_pp_tshirt" }];
  const extra = opt(c, "fppm_apparel_extra", []);
  if (isArr(extra)) {
    for (const e of Object.values(extra)) {
      if (isArr(e) && truthy(e.key) && truthy(e.label)) {
        items.push({
          key: sanitizeKey(str(e.key)), label: sanitizeTextField(str(e.label)), desc: e.desc !== undefined && e.desc !== null ? sanitizeTextField(str(e.desc)) : "",
          price: e.price !== undefined && e.price !== null ? phpFloat(e.price) : 0, url: e.url !== undefined && e.url !== null ? escUrlRaw(str(e.url)) : "",
          wc_id: e.wc_id !== undefined && e.wc_id !== null ? phpInt(e.wc_id) : 0, pp_key: e.pp_key !== undefined && e.pp_key !== null ? sanitizeKey(str(e.pp_key)) : "",
        });
      }
    }
  }
  return items;
}
/** WooCommerce is not active on fppm.us (installed, never switched on): its optional store path stays off. */
export const wcActive = (_c: Ctx) => false;
export const defaultStoreUrl = () => "https://fppm.printful.me/";
export const defaultTshirtUrl = () => "https://fppm.printful.me/product/fppm-official-tee";
export function shopUrl(c: Ctx): string {
  const u = trim(str(opt(c, "fppm_shop_url", "")));
  if (truthy(u)) return escUrlRaw(u);
  return defaultStoreUrl();
}
export function tshirtUrl(c: Ctx): string {
  const u = trim(str(opt(c, "fppm_tshirt_url", "")));
  return truthy(u) ? escUrlRaw(u) : defaultTshirtUrl();
}
export const POSITIONS: [string, string][] = [["GK", "Goalkeeper"], ["RB", "Right Back"], ["CB", "Center Back"], ["LB", "Left Back"], ["CDM", "Defensive Mid"], ["CM", "Central Mid"],
  ["CAM", "Attacking Mid"], ["RW", "Right Wing"], ["LW", "Left Wing"], ["ST", "Striker"], ["UTL", "Utility / Any"]];
export const positionName = (k: string) => POSITIONS.find(([a]) => a === k)?.[1];
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export function waiverVersion(c: Ctx): string {
  const v = trim(str(opt(c, "fppm_waiver_version", "")));
  return truthy(v) ? v : "1.0";
}
export function waiverText(c: Ctx): string {
  const t = opt(c, "fppm_waiver_text", "");
  if (typeof t === "string" && trim(t) !== "") return t;
  const team = teamName(c);
  return WAIVER_PARTS.map((p) => p.split("{$team}").join(team)).join("");
}
export const waiverHash = (c: Ctx) => md5(waiverVersion(c) + "|" + waiverText(c));
export function oathText(c: Ctx): string {
  const t = opt(c, "fppm_oath_text", "");
  if (typeof t === "string" && trim(t) !== "") return t;
  return "I take the Purple Martins oath: to spread the culture of abundance whenever I represent this organization.";
}

/* ---- The waiver Sheet's service account: the GOOGLE_SA_JSON secret (was the fppm_gs_json setting). ---- */
export const gsJson = (c: Ctx) => c.env.GOOGLE_SA_JSON ?? "";
export const gsSheetId = (c: Ctx) => trim(str(opt(c, "fppm_gs_sheet_id", "")));
export function gsTab(c: Ctx): string { const t = trim(str(opt(c, "fppm_gs_tab", ""))); return truthy(t) ? t : "Waivers"; }
export const gsConfigured = (c: Ctx) => truthy(gsJson(c)) && truthy(gsSheetId(c));
export function gsClientEmail(c: Ctx): string {
  try { const d = JSON.parse(gsJson(c)); return isArr(d) && truthy(d.client_email) ? str(d.client_email) : ""; } catch { return ""; }
}

/* ---- 3. Types, statuses, capability ---- */
export const TYPES: Record<string, string> = { fan: "Fan", player: "Player", supporter: "Supporter" };
const has = (o: Record<string, unknown>, k: unknown) => typeof k === "string" || typeof k === "number" ? Object.prototype.hasOwnProperty.call(o, String(k)) : false;
export async function typeOf(c: Ctx, uid: number): Promise<string> {
  const t = await meta(c, uid, "fppm_type");
  return typeof t === "string" && has(TYPES, t) ? t : "fan";
}
export const typeLabel = (t: string) => (has(TYPES, t) ? TYPES[t] : ucfirst(t));
export const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const STATUSES: Record<string, string> = { trialist: "Trialist", rostered: "Rostered", reserve: "Reserve / Alumni" };
export async function playerStatusOf(c: Ctx, uid: number): Promise<string> {
  const s = await meta(c, uid, "fppm_player_status");
  return typeof s === "string" && has(STATUSES, s) ? s : "trialist";
}
export const statusLabel = (s: string) => (has(STATUSES, s) ? STATUSES[s] : ucfirst(s));
/** fppm_can_manage(): the signed-in person (or a given user) is staff or an admin. */
export async function canManage(c: Ctx, uid?: number): Promise<boolean> {
  if (uid === undefined) return can(c, "fppm_manage") || can(c, "manage_options");
  const u = uid === c.uid ? c.user : await loadUser(c.env, uid);
  return userCan(u, "fppm_manage") || userCan(u, "manage_options");
}
export async function userCanId(c: Ctx, uid: number, cap: string): Promise<boolean> {
  return userCan(uid === c.uid ? c.user : await loadUser(c.env, uid), cap);
}

/* ---- 4. Dues log ---- */
export interface DuesEntry { num: number; amount: string; overview: string; created: string; status: string; paid_at: string; paid_by: number }
export async function duesGet(c: Ctx, uid: number): Promise<DuesEntry[]> {
  const l = await meta(c, uid, "fppm_dues_log");
  return Array.isArray(l) ? l : isArr(l) ? Object.values(l) : [];
}
export async function duesAdd(c: Ctx, uid: number, amount: number, overview: string, status = "open"): Promise<number> {
  const log = await duesGet(c, uid);
  const num = log.length + 1;
  log.push({ num, amount: numberFormat(amount, 2).replace(/,/g, ""), overview, created: currentMysql(c), status: status === "paid" ? "paid" : "open", paid_at: "", paid_by: 0 });
  await setMeta(c, uid, "fppm_dues_log", log);
  return num;
}
export const duesOpen = async (c: Ctx, uid: number) => (await duesGet(c, uid)).filter((e) => !truthy(e.status) || e.status !== "paid");
export const duesPaid = async (c: Ctx, uid: number) => (await duesGet(c, uid)).filter((e) => e.status === "paid");
export async function duesOutstanding(c: Ctx, uid: number): Promise<number> {
  let t = 0;
  for (const e of await duesOpen(c, uid)) t += phpFloat(e.amount);
  return t;
}
export async function duesMark(c: Ctx, uid: number, num: string, paid: boolean, by: number): Promise<boolean> {
  const log = await duesGet(c, uid);
  let hit = false;
  for (const e of log) {
    if (str(e.num) === num) {
      e.status = paid ? "paid" : "open";
      e.paid_at = paid ? currentMysql(c) : "";
      e.paid_by = paid ? Math.trunc(by) : 0;
      hit = true;
    }
  }
  if (hit) await setMeta(c, uid, "fppm_dues_log", log);
  return hit;
}

/* ---- 5. Utilities ---- */
export async function displayName(c: Ctx, uid: number): Promise<string> {
  const u = uid === c.uid ? c.user : await loadUser(c.env, uid);
  if (!u) return "(unknown)";
  const name = trim(str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name")));
  return truthy(name) ? name : u.display_name;
}
/** PHP's trim( $s, ', ' ). */
const trimCommaSpace = (s: string) => s.replace(/^[, ]+|[, ]+$/g, "");
export async function addressLine(c: Ctx, uid: number): Promise<string> {
  const street = str(await meta(c, uid, "fppm_address")), city = str(await meta(c, uid, "fppm_city")), state = str(await meta(c, uid, "fppm_state")), zip = str(await meta(c, uid, "fppm_zip"));
  const tail = trimCommaSpace(trim(trim(city + ", " + state) + " " + zip));
  return trim(trimCommaSpace(street + ", " + tail));
}
export function flashHtml(c: Ctx): string {
  const raw = c.get.fppm_note;
  if (!truthy(raw)) return "";
  const code = sanitizeKey(str(raw));
  const map: Record<string, [string, string]> = {
    registered: ["ok", "Welcome to the " + collective(c) + "! Your account is ready."], duespaid: ["ok", "Marked paid."], duesopen: ["ok", "Marked unpaid."],
    statusset: ["ok", "Player status updated."], noted: ["ok", "Note saved."], announced: ["ok", "Announcement posted."], deleted: ["ok", "Member deleted."],
    eventadded: ["ok", "Event added."], eventdeleted: ["ok", "Event deleted."], rsvpset: ["ok", "RSVP saved."], invited: ["ok", "Player invite emailed."],
    playeractive: ["ok", "Welcome to the roster — your player account is active!"], err: ["err", "That action could not be completed."],
  };
  if (!has(map, code)) return "";
  const [kind, msg] = map[code];
  return '<div class="fppm-flash fppm-flash--' + esc(kind) + '">' + esc(msg) + "</div>";
}
/** fppm_redirect_note(): back where the form was, with ?fppm_note=code (admin-post.php's answer). */
export function redirectNote(c: AjaxCtx, code: string): RedirectReply {
  let back = getReferer(c);
  if (!back) back = homeUrl(c, "/account/");
  return new RedirectReply(addQueryArg({ fppm_note: code }, removeQueryArg("fppm_note", back)));
}

/* ---- 6. Styles (once per page) and the PayPal button ---- */
export function styles(c: Ctx): string {
  if (c.once.has("styles")) return "";
  c.once.add("styles");
  return FPPM_STYLES[0];
}
export function paypalButton(url: string, label: string, classes = "fppm-btn fppm-btn--gold"): string {
  if (url) return '<a class="' + esc(classes) + '" href="' + escUrl(url) + '" target="_blank" rel="noopener">' + esc(label) + "</a>";
  return '<span class="' + esc(classes) + ' is-disabled" title="PayPal link not set yet — add it in FPPM options">' + esc(label) + ' <em style="font-weight:400;">(PayPal link coming soon)</em></span>';
}

/** count_users()['avail_roles']['fppm_member']. */
export async function memberCount(c: Ctx): Promise<number> {
  const r = await c.env.DB.prepare(`select count(*) as n from wp_users where exists (select 1 from json_each(wp_users.roles) where value = 'fppm_member')`).first<{ n: number }>();
  return r?.n ?? 0;
}

/** fppm_asset_url(): the plugin's own files, served at the same path (public/). */
export const assetUrl = (c: Ctx, file: string) => c.origin + "/wp-content/plugins/fppm-team-manager/assets/" + file;

/* md5 (the waiver hash is md5( version|text ), as the plugin stored it). */
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] |= 0x80 << (bitLen % 32);
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let i = 0; i < words.length; i += 16) {
    let a = a0, b = b0, cc = c0, d = d0;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = (b & cc) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & cc); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = b ^ cc ^ d; g = (3 * j + 5) % 16; }
      else { f = cc ^ (b | ~d); g = (7 * j) % 16; }
      const tmp = d; d = cc; cc = b;
      const x = (a + f + K[j] + (words[i + g] | 0)) | 0;
      const s = S[(j >> 4) * 4 + (j % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + cc) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map((n) => Array.from({ length: 4 }, (_, k) => ((n >>> (k * 8)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}
