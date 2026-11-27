/**
 * GFF Drive Backup (the gff-drive-backup plugin, 1.1.0): once a day at
 * 12:01 AM site time, the customer list goes to the first tab of a Google
 * Sheet and every paid invoice to its "Paid Invoices" tab, through a service
 * account (a JWT signed RS256 → an access token → the Sheets API). Plus its
 * settings page and the last-run log (gff_dbk_last_log).
 *
 * The service-account JSON was the gff_dbk_sa_json setting; it is now the
 * GDRIVE_SA_JSON Worker secret. The JWT is signed with WebCrypto
 * (RSASSA-PKCS1-v1_5 over SHA-256): deterministic, so for the same key and
 * claims it is byte for byte the signature openssl_sign() made — the bench
 * compares the token request itself. WebCrypto reads PKCS#8 keys ("BEGIN
 * PRIVATE KEY", what Google issues); openssl also accepted PKCS#1.
 */
import { type Ctx, loadUser, meta, opt, setOpt } from "../ctx";
import { esc, escTextarea, gmdate, numberFormat, phpFloat, phpJson, rawurlencode } from "../php";
import { sanitizeTextField } from "../wpfn";
import { currentMysql } from "../wpcore";
import { isArr, str } from "../forms/express";
import { nonceField } from "../render/account";
import { type AdminCtx, can } from "./core";
import { classOf, collectClients, paidPlanOf, ucfirst } from "./clients";
import { DBK_SETTINGS_T } from "./chunks.gen";

export const DBK_HOOK = "gff_dbk_daily_event";
const LOG = "gff_dbk_last_log", TARGET = "gff_dbk_target_file_id", FOLDER = "gff_dbk_folder_id";

class WPError { constructor(public message: string) {} }
type Res<T> = T | WPError;
const isErr = (v: unknown): v is WPError => v instanceof WPError;

/** The service-account JSON (the GDRIVE_SA_JSON secret). */
const saJson = (c: Ctx) => ((c.env as { GDRIVE_SA_JSON?: string }).GDRIVE_SA_JSON ?? "").trim();
const saEmail = (c: Ctx) => { try { const d = JSON.parse(saJson(c)); return isArr(d) && d.client_email ? str(d.client_email) : ""; } catch { return ""; } };

/** gff_dbk_run_backup(): the daily job — run it, keep the outcome in the log. */
export async function runBackup(c: Ctx): Promise<void> {
  const result = await doBackup(c);
  await setOpt(c, LOG, currentMysql(c) + " — " + result);
}

/** gff_dbk_do_backup(): build the rows and push them; a status line, never a throw. */
export async function doBackup(c: Ctx): Promise<string> {
  const json = saJson(c);
  const target = str(opt(c, TARGET, "")).trim();
  if (json === "" || target === "") return "SKIPPED: service-account JSON or target Sheet ID not configured.";
  const rows = await buildRows(c);
  const token = await getAccessToken(c, json);
  if (isErr(token)) return "ERROR (auth): " + token.message;
  const write = await writeSheet(token, target, rows);
  if (isErr(write)) return "ERROR (write): " + write.message;
  let note = "";
  const inv = await buildInvoiceRows(c);
  const ensured = await ensureTab(token, target, "Paid Invoices");
  if (isErr(ensured)) note = " Paid-invoice archive skipped: " + ensured.message;
  else {
    const aw = await writeNamedTab(token, target, "Paid Invoices", inv);
    note = isErr(aw) ? " Paid-invoice archive error: " + aw.message : " + " + Math.max(0, inv.length - 1) + " paid invoice(s) archived.";
  }
  return "OK: wrote " + Math.max(0, rows.length - 1) + " customer row(s) + header to the Google Sheet." + note;
}

const nf2 = (n: number) => numberFormat(n, 2).replace(/,/g, "");
async function invSummary(c: Ctx, uid: number) {
  const l = await meta(c, uid, "gff_inv_log");
  const log: any[] = Array.isArray(l) ? l : isArr(l) ? Object.values(l) : [];
  let open = 0, out = 0, lastSent = "", lastSentT = "", lastPaid = "", lastPaidT = "";
  for (const e of log) {
    const paid = e?.status !== undefined && e?.status !== null && e.status === "paid";
    const amount = e?.amount !== undefined && e?.amount !== null ? str(e.amount) : "";
    const num = e?.num !== undefined && e?.num !== null ? str(e.num) : "";
    if (!paid) { open++; out += phpFloat(amount); }
    const sentAt = e?.sent_at !== undefined && e?.sent_at !== null ? str(e.sent_at) : "";
    if (sentAt !== "" && sentAt > lastSentT) { lastSentT = sentAt; lastSent = num + " $" + amount + " " + sentAt; }
    if (paid) {
      const paidAt = e?.paid_at !== undefined && e?.paid_at !== null ? str(e.paid_at) : "";
      if (paidAt !== "" && paidAt > lastPaidT) { lastPaidT = paidAt; lastPaid = num + " $" + amount + " " + paidAt; }
    }
  }
  return { open, out, lastSent, lastPaid };
}
async function sownSummary(c: Ctx, uid: number): Promise<string> {
  const cr = await meta(c, uid, "gff_crops_wanted");
  const crops = Array.isArray(cr) ? cr : isArr(cr) ? Object.values(cr) : [];
  const pl = await meta(c, uid, "gff_crops_planted");
  const planted: Record<string, any> = isArr(pl) ? (pl as Record<string, any>) : {};
  let done = 0;
  for (const x of crops) { const v = planted[str(x)]; if (!(v === undefined || v === null || v === "" || v === "0" || v === 0 || v === false)) done++; }
  return done + "/" + crops.length;
}
const TIER: Record<string, string> = { lead: "Lead", seed: "Free Seeds", customer: "Paid" };

/** gff_dbk_build_rows(): header + one row per client, the 26 CSV columns and 7 derived ones. */
export async function buildRows(c: Ctx): Promise<string[][]> {
  const out: string[][] = [["Role", "Name", "Email", "Phone", "Service Address", "City", "ZIP", "Start size", "Start Date", "Rate Lock", "Reservation", "Paid", "Txn ID", "Paid At", "Credited", "Add-ons", "Add-ons Total", "Add-ons Invoiced", "Crops Wanted", "Farm Layout", "Moringa Fruit Upgrade", "Workshop Interest", "Agreement Version", "Accepted At", "Accept IP", "Joined", "Tier", "Paid Plan", "Sown", "Open Invoices", "Outstanding", "Last Invoice", "Last Paid"]];
  for (const r of await collectClients(c)) {
    const inv = await invSummary(c, r.id);
    const k = await classOf(c, r.id);
    const plan = await paidPlanOf(c, r.id);
    out.push([r.role, r.name, r.email, r.phone, r.address, r.city, r.zip, r.sqft, r.start_date, r.ratelock, r.reservation, r.reservation_paid, r.reservation_txn,
      r.reservation_paid_at, r.reservation_credited, r.addons, r.addons_total, r.addons_invoiced, r.crops.join("; "), r.farm_layout, r.moringa_upgrade, r.workshop,
      r.agr_ver, r.agr_when, r.agr_ip, r.joined, TIER[k] ?? k, plan === "" ? "" : ucfirst(plan), await sownSummary(c, r.id),
      String(inv.open), inv.out > 0 ? nf2(inv.out) : "", inv.lastSent, inv.lastPaid]);
  }
  return out;
}

/** gff_dbk_build_invoice_rows(): one row per paid invoice, every client. */
export async function buildInvoiceRows(c: Ctx): Promise<string[][]> {
  const out: string[][] = [["Customer", "Email", "Invoice #", "Amount", "Sent", "Paid", "Paid By", "Overview"]];
  const s = (e: any, k: string) => (e?.[k] !== undefined && e?.[k] !== null ? str(e[k]) : "");
  for (const cl of await collectClients(c)) {
    const l = await meta(c, cl.id, "gff_inv_log");
    if (!isArr(l)) continue;
    for (const e of Object.values(l) as any[]) {
      if (e?.status !== "paid") continue;
      let by = "";
      const pb = e.paid_by;
      if (!(pb === undefined || pb === null || pb === "" || pb === "0" || pb === 0 || pb === false)) { const u = await loadUser(c.env, Number(pb) | 0); if (u) by = u.display_name; }
      out.push([cl.name, cl.email, s(e, "num"), s(e, "amount"), s(e, "sent_at"), s(e, "paid_at"), by, s(e, "overview")]);
    }
  }
  return out;
}

/* ---- Google ---- */
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));
/** PHP's urlencode() (http_build_query's encoding). */
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

/** gff_dbk_get_access_token(): sign the JWT, exchange it for an access token. */
async function getAccessToken(c: Ctx, json: string): Promise<Res<string>> {
  let creds: any = null;
  try { creds = JSON.parse(json); } catch { creds = null; }
  if (!isArr(creds) || !creds.client_email || !creds.private_key) return new WPError("Service-account JSON is missing client_email or private_key.");
  const now = c.now;
  const claim = { iss: creds.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const input = b64urlStr(phpJson({ alg: "RS256", typ: "JWT" })) + "." + b64urlStr(phpJson(claim));
  const sig = await signRs256(str(creds.private_key), input);
  if (!sig) return new WPError("Could not sign the JWT (check the private_key in the JSON).");
  const jwt = input + "." + b64url(sig);
  let code = 0, body: any = null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: "grant_type=" + urlencode("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + urlencode(jwt),
    });
    code = res.status;
    try { body = JSON.parse(await res.text()); } catch { body = null; }
  } catch (e) { return new WPError(String((e as Error).message ?? e)); }
  if (code !== 200 || !isArr(body) || !body.access_token) {
    return new WPError("Token exchange failed: " + (isArr(body) && body.error_description !== undefined && body.error_description !== null ? str(body.error_description) : "HTTP " + code));
  }
  return str(body.access_token);
}

const sheetBase = (id: string) => "https://sheets.googleapis.com/v4/spreadsheets/" + rawurlencode(id);
async function call(method: string, url: string, token: string, body?: string): Promise<Res<{ code: number; json: any }>> {
  try {
    const res = await fetch(url, {
      method, signal: AbortSignal.timeout(30000),
      headers: body === undefined ? { Authorization: "Bearer " + token } : { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { code: res.status, json };
  } catch (e) { return new WPError(String((e as Error).message ?? e)); }
}
const errMsg = (r: { code: number; json: any }) => (isArr(r.json) && r.json.error?.message !== undefined && r.json.error?.message !== null ? str(r.json.error.message) : "HTTP " + r.code);

/** gff_dbk_ensure_tab(): create the named tab unless it is there (a refused create still counts: it exists). */
async function ensureTab(token: string, id: string, title: string): Promise<Res<true>> {
  const base = sheetBase(id);
  const get = await call("GET", base + "?fields=sheets.properties.title", token);
  if (!isErr(get) && get.code === 200 && isArr(get.json) && isArr(get.json.sheets)) {
    for (const s of Object.values(get.json.sheets) as any[]) if (s?.properties?.title === title) return true;
  }
  const add = await call("POST", base + ":batchUpdate", token, phpJson({ requests: [{ addSheet: { properties: { title } } }] }));
  return isErr(add) ? add : true;
}
/** gff_dbk_write_named_tab(): clear and rewrite one named tab. */
async function writeNamedTab(token: string, id: string, tab: string, rows: string[][]): Promise<Res<true>> {
  const base = sheetBase(id);
  const quoted = "'" + tab.replace(/'/g, "''") + "'";
  const clear = await call("POST", base + "/values/" + rawurlencode(quoted + "!A:Z") + ":clear", token, "{}");
  if (isErr(clear)) return clear;
  const write = await call("PUT", base + "/values/" + rawurlencode(quoted + "!A1") + "?valueInputOption=USER_ENTERED", token, phpJson({ values: rows }));
  if (isErr(write)) return write;
  if (write.code !== 200) return new WPError('Could not write the "' + tab + '" tab (HTTP ' + write.code + "): " + errMsg(write));
  return true;
}
/** gff_dbk_write_sheet(): clear the first tab, then write every row from A1. */
async function writeSheet(token: string, id: string, rows: string[][]): Promise<Res<true>> {
  const base = sheetBase(id);
  const clear = await call("POST", base + "/values/A:Z:clear", token, "{}");
  if (isErr(clear)) return clear;
  if (clear.code !== 200) return new WPError("Could not clear the sheet (HTTP " + clear.code + "): " + errMsg(clear) + " — confirm the Sheet is shared with the service account as Editor and the ID is correct.");
  const write = await call("PUT", base + "/values/A1?valueInputOption=USER_ENTERED", token, phpJson({ values: rows }));
  if (isErr(write)) return write;
  if (write.code !== 200) return new WPError("Could not write to the sheet (HTTP " + write.code + "): " + errMsg(write));
  return true;
}

/* ---- Schedule ---- */
/** The site's UTC offset in seconds (gmt_offset; timezone_string is empty on this site). */
const siteOffset = (c: Ctx) => Math.round((Number.parseFloat(str(opt(c, "gmt_offset", 0))) || 0) * 3600);
/** The next 12:01 AM site time after now (what gff_dbk_schedule() planned). */
export function nextRun(c: Ctx): number {
  const off = siteOffset(c);
  const local = c.now + off;
  let t = Math.floor(local / 86400) * 86400 + 60;
  if (t <= local) t += 86400;
  return t - off;
}
/** wp_next_scheduled(): the planned run the timetable holds (carried over from WP-Cron, moved on after each run). */
const nextScheduled = (c: Ctx) => Number(str(opt(c, "cron_next:" + DBK_HOOK, 0))) || 0;
/** wp_date( $format, $ts ) in the site's offset. */
const wpDate = (c: Ctx, f: string, ts: number) => gmdate(f, ts + siteOffset(c));

/* ---- Settings page (Tools → GFF Drive Backup) ---- */
/** The GFF Drive Backup settings registered for options.php (the JSON is a Worker secret now: not saved from here). */
export const DBK_SETTINGS: [string, "sanitize_text_field"][] = [[FOLDER, "sanitize_text_field"], [TARGET, "sanitize_text_field"]];
export async function saveDbkSettings(c: AdminCtx): Promise<void> {
  for (const [name] of DBK_SETTINGS) await setOpt(c, name, sanitizeTextField(c.post[name] !== undefined ? str(c.post[name]).trim() : ""));
}

/** gff_dbk_settings_page(), with the "Run backup now" button. */
export async function dbkSettingsPage(c: AdminCtx): Promise<string> {
  if (!can(c, "manage_options")) return "";
  let o = "";
  if (c.post.gff_dbk_run_now !== undefined) {
    const msg = await doBackup(c);
    await setOpt(c, LOG, currentMysql(c) + " — " + msg);
    o += '<div class="notice notice-info is-dismissible"><p>Backup run: ' + esc(msg) + "</p></div>";
  }
  const target = str(opt(c, TARGET, ""));
  const log = str(opt(c, LOG, ""));
  const next = nextScheduled(c);
  const email = saEmail(c);
  const T = DBK_SETTINGS_T;
  o += T[0] + (next ? T[1] + esc(wpDate(c, "M j, Y g:i A", next)) + T[2] : T[3]) + T[4];
  if (log !== "" && log !== "0") o += T[5] + esc(log) + T[6];
  o += T[7];
  if (email !== "" && email !== "0") o += T[8] + esc(email) + T[9];
  o += T[10] + "<input type='hidden' name='option_page' value='gff_dbk_group' />" + '<input type="hidden" name="action" value="update" />' + nonceField(c, "gff_dbk_group-options", "_wpnonce")
    + T[11] + esc(TARGET) + T[12] + esc(TARGET) + T[13] + esc(TARGET) + T[14] + esc(target) + T[15]
    + esc("gff_dbk_sa_json") + T[16] + esc("gff_dbk_sa_json") + T[17] + esc("gff_dbk_sa_json") + T[18] + escTextarea("") + T[19]
    + '<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" value="Save settings"  /></p>'
    + T[20] + nonceField(c, "gff_dbk_run_now", "_wpnonce") + T[21];
  return withSecretRow(c, o);
}
/** The JSON row: whether the secret is set and how to set it — never the JSON. */
export const DBK_JSON_ROW = /<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON<\/label><\/th>[\s\S]*?<\/tr>/;
function withSecretRow(c: Ctx, html: string): string {
  const set = saJson(c) !== "";
  return html.replace(DBK_JSON_ROW, () => '<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON</label></th>\n\t\t\t\t\t<td><p><strong>'
    + (set ? "Set" : "Not set") + "</strong> — a Worker secret, never shown here. Set or replace it with <code>wrangler secret put GDRIVE_SA_JSON</code> (paste the whole downloaded key file).</p></td>\n\t\t\t\t</tr>");
}
