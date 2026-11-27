/**
 * Section 10b: the waiver's off-server record. Each signed waiver is appended
 * to a Google Sheet (a service account: an RS256 JWT → an access token → the
 * Sheets API), soft-failing into fppm_waiver_synced = 0; plus the waiver
 * rows, the admin Waivers page, its CSV export and "sync pending".
 *
 * The service-account JSON was the fppm_gs_json setting; it is the
 * GOOGLE_SA_JSON Worker secret now. The JWT is signed with WebCrypto
 * (RSASSA-PKCS1-v1_5 over SHA-256), which is deterministic: the same key and
 * claims give the same bytes as the plugin's openssl_sign(), and the bench
 * compares every request sent to Google.
 */
import { type Ctx, adminUrl, meta, setMeta } from "../ctx";
import { esc, escUrl, phpInt, phpJson, rawurlencode, truthy } from "../php";
import { addQueryArg, csvLine, DieReply, FileReply, RedirectReply } from "../wp";
import { gmdate } from "../php";
import type { AjaxCtx } from "../ajax";
import { can } from "../ctx";
import { displayName, gsClientEmail, gsConfigured, gsJson, gsSheetId, gsTab, isArr, str, typeLabel, typeOf } from "./core";
import { getUsers } from "./members";
import { nonceUrl } from "./ui";
import { FPPM_WAIVERS_PAGE } from "./templates.gen";

class GError { constructor(public message: string) {} }
type Res<T> = T | GError;
const isErr = (v: unknown): v is GError => v instanceof GError;

export const WAIVER_HEADER = ["accepted_at", "name", "email", "phone", "address", "city", "state", "zip", "type", "waiver_version", "waiver_hash", "ip", "user_agent", "user_id"];

/** fppm_waiver_row(): one member's waiver as the Sheet and the CSV hold it; null with none on file. */
export async function waiverRow(c: Ctx, uid: number): Promise<string[] | null> {
  const w = await meta(c, uid, "fppm_waiver");
  if (!isArr(w)) return null;
  const u = await c.env.DB.prepare("select email from wp_users where id = ?").bind(uid).first<{ email: string }>();
  const f = (k: string) => (w[k] !== undefined && w[k] !== null ? w[k] : undefined);
  return [
    f("at") !== undefined ? f("at") : "", f("name") !== undefined ? f("name") : await displayName(c, uid), f("email") !== undefined ? f("email") : u ? u.email : "",
    await meta(c, uid, "fppm_phone"), await meta(c, uid, "fppm_address"), await meta(c, uid, "fppm_city"), await meta(c, uid, "fppm_state"), await meta(c, uid, "fppm_zip"),
    typeLabel(await typeOf(c, uid)), f("version") !== undefined ? f("version") : "", f("hash") !== undefined ? f("hash") : "", f("ip") !== undefined ? f("ip") : "",
    f("ua") !== undefined ? f("ua") : "", String(uid),
  ] as string[];
}

/** fppm_waiver_record_offsite(): append the waiver to the Sheet; true, or the error (and synced = 0). */
export async function waiverRecordOffsite(c: Ctx, uid: number): Promise<true | GError> {
  const row = await waiverRow(c, uid);
  if (row === null) return new GError("No waiver on file for this user.");
  if (!gsConfigured(c)) { await setMeta(c, uid, "fppm_waiver_synced", 0); return new GError("Google Sheet not configured."); }
  const token = await gToken(c, gsJson(c));
  if (isErr(token)) { await setMeta(c, uid, "fppm_waiver_synced", 0); return token; }
  const sid = gsSheetId(c), tab = gsTab(c);
  const ens = await gEnsureTab(token, sid, tab);
  if (isErr(ens)) { await setMeta(c, uid, "fppm_waiver_synced", 0); return ens; }
  if (ens === true) await gAppend(c, token, sid, tab, [WAIVER_HEADER]);
  const res = await gAppend(c, token, sid, tab, [row]);
  if (isErr(res)) { await setMeta(c, uid, "fppm_waiver_synced", 0); return res; }
  await setMeta(c, uid, "fppm_waiver_synced", 1);
  return true;
}

/* ---- Google ---- */
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));
const urlencode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()*~]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());

/** RS256 over the signing input with a PEM PKCS#8 key; null when the key is unusable. */
export async function signRs256(pem: string, input: string): Promise<Uint8Array | null> {
  try {
    const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
    const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)));
  } catch { return null; }
}

async function http(method: string, url: string, headers: Record<string, string>, body?: string): Promise<Res<{ code: number; text: string }>> {
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30000) });
    return { code: res.status, text: await res.text() };
  } catch (e) { return new GError(String((e as Error).message ?? e)); }
}
const json = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };

/** fppm_g_token(). */
async function gToken(c: Ctx, jsonString: string): Promise<Res<string>> {
  const creds = json(jsonString);
  if (!isArr(creds) || !truthy(creds.client_email) || !truthy(creds.private_key)) return new GError("Service-account JSON is missing client_email or private_key.");
  const now = c.now;
  const input = b64urlStr(phpJson({ alg: "RS256", typ: "JWT" })) + "." + b64urlStr(phpJson({ iss: creds.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = await signRs256(str(creds.private_key), input);
  if (!sig) return new GError("Could not sign the JWT (check private_key).");
  const jwt = input + "." + b64url(sig);
  const r = await http("POST", "https://oauth2.googleapis.com/token", { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    "grant_type=" + urlencode("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + urlencode(jwt));
  if (isErr(r)) return r;
  const body = json(r.text);
  if (r.code !== 200 || !isArr(body) || !truthy(body.access_token)) {
    const msg = isArr(body) && body.error_description !== undefined && body.error_description !== null ? str(body.error_description) : "token exchange failed";
    return new GError("Google token exchange failed: " + msg);
  }
  return str(body.access_token);
}
const sheetBase = (id: string) => "https://sheets.googleapis.com/v4/spreadsheets/" + rawurlencode(id);
/** fppm_g_ensure_tab(): true when just created, "exists", or the error. */
async function gEnsureTab(token: string, sheetId: string, title: string): Promise<Res<true | "exists">> {
  const base = sheetBase(sheetId);
  const get = await http("GET", base + "?fields=sheets.properties.title", { Authorization: "Bearer " + token });
  if (!isErr(get) && get.code === 200) {
    const b = json(get.text);
    if (isArr(b) && isArr(b.sheets)) for (const s of Object.values(b.sheets) as any[]) if (s?.properties?.title !== undefined && s.properties.title === title) return "exists";
  } else if (isErr(get)) return get;
  const add = await http("POST", base + ":batchUpdate", { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    phpJson({ requests: [{ addSheet: { properties: { title } } }] }));
  if (isErr(add)) return add;
  return add.code === 200 ? true : "exists";
}
/** fppm_g_append(). */
async function gAppend(c: Ctx, token: string, sheetId: string, tab: string, rows: unknown[][]): Promise<Res<true>> {
  const quoted = "'" + tab.replace(/'/g, "''") + "'";
  const url = sheetBase(sheetId) + "/values/" + rawurlencode(quoted + "!A1") + ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";
  const r = await http("POST", url, { Authorization: "Bearer " + token, "Content-Type": "application/json" }, phpJson({ values: rows }));
  if (isErr(r)) return r;
  if (r.code !== 200) {
    const b = json(r.text);
    const msg = isArr(b) && b.error?.message !== undefined && b.error?.message !== null ? str(b.error.message) : "HTTP " + r.code;
    return new GError("Could not append to the Sheet (HTTP " + r.code + "): " + msg + " — confirm the Sheet is shared with " + gsClientEmail(c) + " as Editor.");
  }
  return true;
}

/** fppm_all_waivers(): members with a waiver on file, newest registration first. */
export async function allWaivers(c: Ctx): Promise<{ id: number; w: Record<string, any>; synced: number }[]> {
  const out = [];
  for (const u of await getUsers(c, { role__in: ["fppm_member"], number: 5000, orderby: "registered", order: "DESC" })) {
    const w = await meta(c, u.ID, "fppm_waiver");
    if (isArr(w) && truthy(w.accepted)) out.push({ id: u.ID, w, synced: phpInt(await meta(c, u.ID, "fppm_waiver_synced")) });
  }
  return out;
}

/** fppm_waivers_page() (Purple Martins → Waivers; administrators). */
export async function waiversPage(c: AjaxCtx): Promise<string> {
  if (!can(c, "manage_options")) return "";
  const waivers = await allWaivers(c);
  const pending = waivers.filter((r) => r.synced !== 1);
  let o = "";
  if (c.get.fppm_synced !== undefined) {
    const n = phpInt(c.get.fppm_synced), f = c.get.fppm_failed !== undefined ? phpInt(c.get.fppm_failed) : 0;
    o += '<div class="notice notice-' + (f ? "warning" : "success") + ' is-dismissible"><p>Synced ' + esc(n) + " waiver(s) to Google Sheets" + (f ? ", " + esc(f) + " failed (see the service-account sharing)." : ".") + "</p></div>";
  }
  const csv = nonceUrl(adminUrl(c, "admin-post.php?action=fppm_export_waivers"), "fppm_export_waivers");
  const sync = nonceUrl(adminUrl(c, "admin-post.php?action=fppm_sync_waivers"), "fppm_sync_waivers");
  const T = FPPM_WAIVERS_PAGE;
  const email = gsClientEmail(c);
  o += T[0] + waivers.length + T[1]
    + (gsConfigured(c) ? "✅ Google Sheet configured" + (email ? " (share it with <code>" + esc(email) + "</code> as Editor)" : "") : "⚠️ not configured — set the service-account JSON + Sheet ID in Settings. Waivers are still recorded on-server and exportable below.")
    + T[2] + escUrl(csv) + T[3];
  if (gsConfigured(c)) o += T[4] + escUrl(sync) + T[5] + pending.length + T[6];
  o += T[7];
  if (!waivers.length) o += T[8];
  else {
    for (const r of waivers) {
      const w = r.w;
      const g = (k: string) => (w[k] !== undefined && w[k] !== null ? w[k] : "");
      o += T[9] + esc(g("at")) + T[10] + esc(w.name !== undefined && w.name !== null ? w.name : await displayName(c, r.id)) + T[11] + esc(g("email")) + T[12] + esc(g("version")) + T[13] + esc(g("ip")) + T[14] + (r.synced === 1 ? "✅" : "—") + T[15];
    }
  }
  return o + T[16];
}

/** fppm_h_export_waivers(): every waiver as CSV. */
export async function exportWaivers(c: AjaxCtx): Promise<FileReply | DieReply> {
  if (!can(c, "manage_options")) return new DieReply("Not allowed.");
  let out = csvLine(WAIVER_HEADER);
  for (const r of await allWaivers(c)) {
    const row = await waiverRow(c, r.id);
    if (row) out += csvLine(row);
  }
  return new FileReply(["Content-Type: text/csv; charset=utf-8", "Content-Disposition: attachment; filename=fppm-waivers-" + gmdate("Y-m-d", c.now) + ".csv"], out);
}

/** fppm_h_sync_waivers(): push every pending waiver to the Sheet. */
export async function syncWaivers(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!can(c, "manage_options")) return new DieReply("Not allowed.");
  let ok = 0, fail = 0;
  for (const r of await allWaivers(c)) {
    if (r.synced === 1) continue;
    const res = await waiverRecordOffsite(c, r.id);
    if (isErr(res)) fail++; else ok++;
  }
  return new RedirectReply(addQueryArg({ fppm_synced: ok, fppm_failed: fail }, adminUrl(c, "admin.php?page=fppm-waivers")));
}
