/**
 * Steps and fakes for the client admin (src/admin): the GFF Clients and GFF
 * Settings screens, the profile panels and their saves, the Dispatch
 * dashboard, the 14 admin-post.php handlers, the options.php save and the
 * daily gff_v33_cron. Users: 1 administrator, 30/33 gff_staff, 4/18/24/27/28
 * gff_customer, 29 gff_lead.
 *
 * The fake outside world (one per side): Google geocoding and Nominatim give
 * every address a made-up point (none for addresses containing "Nowhere"),
 * and OSRM drives straight between the points it is given.
 */
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import type { Handler } from "./harness";
import type { Step } from "./actions.steps";
import type { AjaxCtx } from "../src/ajax";
import { loadUser } from "../src/ctx";
import type { AdminCtx } from "../src/admin/core";
import { adminDashboard, clientsPage, profilePanels, settingsPage } from "../src/admin/views";
import { profileSave, saveSettings } from "../src/admin/posts";
import { DBK_JSON_ROW, dbkSettingsPage } from "../src/admin/drive";

/**
 * The one spot the admin screens differ by design: GFF Drive Backup's
 * service-account JSON row (the plugin printed the key into a textarea;
 * the Worker shows only whether the GDRIVE_SA_JSON secret is set).
 */
export function normaliseAdmin(reply: any): any {
  if (reply && typeof reply.html === "string") return { ...reply, html: reply.html.replace(DBK_JSON_ROW, "<tr>[the service-account JSON row]</tr>") };
  return reply;
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** A throwaway service-account key, made for this run (both sides sign with it; never committed). */
const { privateKey: TEST_KEY, publicKey: TEST_PUB } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
// (A leading space keeps @option from decoding the JSON into an array: the plugin stores the text.)
const SA = " " + JSON.stringify({ type: "service_account", client_email: "backup@gff-test.iam.gserviceaccount.com", private_key: TEST_KEY });
const SA_BAD = " " + JSON.stringify({ type: "service_account", client_email: "bad-backup@gff-test.iam.gserviceaccount.com", private_key: TEST_KEY });

/** A made-up, never-integral point for an address. */
function pointFor(addr: string): [number, number] {
  const h = parseInt(md5(addr.toLowerCase()).slice(0, 8), 16);
  return [27.3 + (h % 9973) / 31337 + 0.000013, -80.4 + ((h >> 8) % 9967) / 29873 - 0.000017];
}
/** Google's encoded polyline (precision 5). */
function encodePolyline(pts: [number, number][]): string {
  let out = "", pla = 0, plo = 0;
  const enc = (v: number) => { let s = v < 0 ? ~(v << 1) : v << 1; let o = ""; while (s >= 0x20) { o += String.fromCharCode((0x20 | (s & 0x1f)) + 63); s >>= 5; } return o + String.fromCharCode(s + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), b = Math.round(lo * 1e5); out += enc(a - pla) + enc(b - plo); pla = a; plo = b; }
  return out;
}

export const adminHandler: Handler = (url) => {
  const q = (name: string) => { const m = new RegExp("[?&]" + name + "=([^&]*)").exec(url); return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; };
  if (url.startsWith("/geocode/maps/api/geocode/json")) {
    const addr = q("address");
    if (/nowhere/i.test(addr)) return { results: [], status: "ZERO_RESULTS" };
    const [lat, lng] = pointFor(addr);
    return { results: [{ geometry: { location: { lat, lng } } }], status: "OK" };
  }
  if (url.startsWith("/nominatim/search")) {
    const addr = q("q");
    if (/nowhere/i.test(addr)) return [];
    const [lat, lon] = pointFor(addr);
    return [{ lat: String(lat), lon: String(lon) }];
  }
  const r = /^\/osrm\/route\/v1\/driving\/([^?]+)/.exec(url);
  if (r) {
    const pts = r[1].split(";").map((p) => { const [lo, la] = p.split(",").map(Number); return [la, lo] as [number, number]; });
    return { code: "Ok", routes: [{ duration: 1234.5 + pts.length * 300.25, distance: 20345.7 + pts.length * 1000.5, geometry: encodePolyline(pts) }] };
  }
  return undefined;
};

/**
 * Google's token and Sheets endpoints for the Drive backup, one per side: every request is logged
 * (method, URL, Authorization, body — the bench compares the two logs), and the Sheet remembers
 * whether its "Paid Invoices" tab exists. A JWT from a "bad-…" service account is refused; the
 * Sheet "locked-sheet" refuses the clear, "full-sheet" the first write, "tabless-sheet" the new tab.
 */
export function googleFake(): { handle: Handler; log: unknown[] } {
  const log: unknown[] = [];
  const tabs = new Map<string, boolean>();
  const handle: Handler = (url, body, req) => {
    if (!url.startsWith("/google-oauth/token") && !url.startsWith("/sheets/")) return undefined;
    log.push([req.method, url, req.headers.authorization ?? "", body]);
    if (url.startsWith("/google-oauth/token")) {
      const jwt = decodeURIComponent((/assertion=([^&]*)/.exec(body)?.[1] ?? "").replace(/\+/g, " "));
      const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString() || "{}");
      // Google checks the RS256 signature against the key's public half (both sides' JWTs must verify; the runner
      // separately requires the two assertions, signatures included, to be byte-identical).
      const [h, p, sig] = jwt.split(".");
      const signed = createVerify("RSA-SHA256").update(h + "." + p).verify(TEST_PUB, Buffer.from(sig ?? "", "base64url"));
      if (!signed || String(claims.iss ?? "").startsWith("bad-")) return { __status: 400, __body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }) };
      return { access_token: "ya29.fake-" + md5(jwt).slice(0, 12), expires_in: 3599, token_type: "Bearer" };
    }
    const m = /^\/sheets\/v4\/spreadsheets\/([^/?:]+)(.*)$/.exec(url)!;
    const id = decodeURIComponent(m[1]), rest = m[2];
    const err = (code: number, message: string) => ({ __status: code, __body: JSON.stringify({ error: { code, message } }) });
    if (rest.startsWith("?fields=")) return { sheets: [{ properties: { title: "Sheet1" } }, ...(tabs.get(id) ? [{ properties: { title: "Paid Invoices" } }] : [])] };
    if (rest === ":batchUpdate") { if (id === "tabless-sheet") return err(400, "Invalid requests[0].addSheet"); tabs.set(id, true); return { replies: [{}] }; }
    if (rest.endsWith(":clear")) return id === "locked-sheet" && rest.startsWith("/values/A:Z") ? err(403, "The caller does not have permission") : { clearedRange: "A1:Z1000" };
    if (id === "full-sheet" && rest.startsWith("/values/A1")) return err(400, "This action would increase the number of cells in the workbook above the limit of 10000000 cells.");
    return { updatedCells: 1 };
  };
  return { handle, log };
}

/** The request URI of each screen (wp_referer_field() prints it). */
function screenUri(screen: string, id: number, uid: number, get: Record<string, unknown>): string {
  const base = screen === "clients" ? "/wp-admin/admin.php?page=gff-clients" : screen === "settings" ? "/wp-admin/admin.php?page=gff-settings"
    : screen === "dashboard" ? "/account/" : screen === "drive" ? "/wp-admin/tools.php?page=gff-drive-backup" : id === uid ? "/wp-admin/profile.php" : "/wp-admin/user-edit.php?user_id=" + id;
  const qs = new URLSearchParams(get as Record<string, string>).toString();
  return qs ? base + (base.includes("?") ? "&" : "?") + qs : base;
}

/** The Worker side of an @admin:<screen> step (test/action-php.php documents the kinds). */
export async function adminStep(ac: AjaxCtx, what: string): Promise<unknown> {
  const c = ac as AdminCtx & { requestUri?: string };
  const [screen, idS = "0"] = what.split(":");
  const id = Number(idS) || 0;
  c.requestUri = screenUri(screen, id, c.uid, c.get);
  if (screen === "clients") { const r = await clientsPage(c); return typeof r === "string" ? { html: r } : r; }
  if (screen === "settings") return { html: settingsPage(c) };
  if (screen === "dashboard") return { html: await adminDashboard(c) };
  if (screen === "drive") return { html: await dbkSettingsPage(c) };
  if (screen === "profile") { const u = await loadUser(c.env, id); return { html: u ? await profilePanels(c, u) : "" }; }
  if (screen === "save") { await profileSave(c, id); return { html: "" }; }
  throw new Error("no admin screen " + what);
}
/** The Worker side of @options (the GFF Settings form posted to options.php). */
export async function optionsStep(ac: AjaxCtx): Promise<unknown> {
  const r = await saveSettings(ac as AdminCtx);
  return typeof r.body === "string" ? { die: r.body } : r.body;
}

const A = (screen: string, uid = 1, get: Record<string, string> = {}, tag = "admin"): Step => ({ uid, action: "@admin:" + screen, get, tag });
const P = (name: string, uid: number, post: Record<string, string | string[]>, referer = "https://gawlakfamilyfarms.com/account/", tag = "adminpost"): Step =>
  ({ uid, action: "@post:" + name, post, referer, tag });
const M = (uid: number, post: Record<string, string>, tag = "admin"): Step => ({ uid, action: "@meta", post, tag });
const J = (v: unknown) => JSON.stringify(v);
const MSG_TIME = "2026-11-20 07:30:00"; // half an hour ago on the site's clock (UTC-4)
const MSG_ID = md5("18|message|" + MSG_TIME + "|Can you add basil to my bed this week please?");

export const STEPS_ADMIN: Step[] = [
  /* ---- the screens, before anything changes, for each kind of user ---- */
  A("clients", 1), A("clients", 30), A("clients", 4),
  A("settings", 1), A("settings", 30),
  A("dashboard", 1), A("dashboard", 30), A("dashboard", 4),
  A("profile:4", 1), A("profile:1", 1), A("profile:4", 30), A("profile:18", 1),

  /* ---- data for the feed, the map and the tables ---- */
  M(18, { gff_acct_messages: J([{ time: MSG_TIME, msg: "Can you add basil to my bed this week please?" }, { time: "2026-11-01 09:00:00", msg: "old <b>one</b>\nline two" }]),
    gff_spire_unlock_request: J({ status: "invoice_requested", time: "2026-11-20 05:00:00" }), gff_spire_addon_request: J({ qty: "2", monthly: "75", time: "2026-11-19 20:00:00" }),
    gff_crops_wanted: J(["Kale", "Basil", "Kale", "", "Mint"]), gff_crops_planted: J({ Kale: "2026-11-02 10:00:00" }) }),
  // The plugin keeps the layout as JSON text (an @meta step would store an array): saved through the planner instead.
  { uid: 18, action: "gff_planner_autosave", post: { gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Basil", "Mint"] }, { tower: 2, plants: [] }] }) }, tag: "admin" },
  M(27, { gff_lead_at: "2026-11-19 22:00:00", gff_lead_city: "Port St. Lucie", gff_moringa_fruit_upgrade: "yes",
    gff_addons_labels: "Starfruit, Strawberry", gff_addons_total: "80", gff_addons_invoiced: "yes", gff_reservation: "consult", gff_reservation_txn: "TX-1" }),
  M(28, { gff_service_city: "Stuart", gff_service_zip: "34994", gff_paid_plan: "both", gff_reservation: "down_payment", gff_reservation_paid_at: "2026-11-20 03:00:00", gff_start_date: "2026-12-01",
    gff_agreement_accepted_at: "2026-11-01 12:00:00", gff_agreement_version: "6.0", gff_agreement_ip: "203.0.113.9", gff_start_sqft: "400" }),
  M(24, { gff_service_address: "1 Nowhere Lane", gff_class: "customer", gff_crops_wanted: J(["Okra"]) }),
  M(33, { gff_phone: "(772) 555-0199" }),
  A("dashboard", 1), A("dashboard", 1),                                   // the second load finishes the routes from the caches
  A("clients", 1),

  /* ---- notices on the screens ---- */
  A("clients", 1, { gff_inv: "sent", gff_inv_amt: "12.5x0" }), A("clients", 1, { gff_inv: "failed" }), A("clients", 1, { gff_inv: "noamount" }),
  A("clients", 1, { gff_inv: "baduser", gff_cnote: "converted" }), A("clients", 1, { gff_cnote: "nope" }),
  A("dashboard", 30, { gff_dnote: "forwarded" }), A("dashboard", 30, { gff_dnote: "zzz", gff_inv: "noamount" }), A("dashboard", 30, { gff_cnote: "invpaid" }),

  /* ---- CSV exports ---- */
  P("gff_export_clients", 1, {}), P("gff_export_clients", 30, {}), P("gff_export_seeds_mailer", 30, {}), P("gff_export_seeds_mailer", 4, {}),

  /* ---- invoices from the list, then marked paid and reopened ---- */
  P("gff_send_invoice_row", 4, { gff_inv_user: "18", gff_inv_amount: "10" }),
  P("gff_send_invoice_row", 1, { gff_inv_user: "999", gff_inv_amount: "10" }, ""),
  P("gff_send_invoice_row", 1, { gff_inv_user: "18", gff_inv_amount: "abc" }, "https://gawlakfamilyfarms.com/wp-admin/admin.php?page=gff-clients&gff_inv=sent"),
  P("gff_send_invoice_row", 1, { gff_inv_user: "18", gff_inv_amount: "$1,234.5", gff_inv_overview: "Two towers <b>&</b>\nherbs" }, "https://gawlakfamilyfarms.com/wp-admin/admin.php?page=gff-clients&gff_inv=failed#top"),
  P("gff_send_invoice_row", 30, { gff_inv_user: "28", gff_inv_amount: "300" }, "https://elsewhere.example/x"),
  { uid: 0, action: "@option", post: { gff_pay_paypal_me: "", gff_pay_cashapp: "", gff_pay_venmo: "@farm venmo", gff_pay_zelle: "", gff_pay_ach: "Line one\nLine two", gff_reg_paypal_link: "" }, tag: "adminpost" },
  P("gff_send_invoice_row", 1, { gff_inv_user: "27", gff_inv_amount: "5" }),
  P("gff_inv_mark_paid", 1, { uid: "18", num: "GFF-000221-U18-20261120", paid: "1" }),
  P("gff_inv_mark_paid", 30, { uid: "18", num: "GFF-000221-U18-20261120", paid: "0" }, "https://gawlakfamilyfarms.com/account/?gff_cnote=invpaid"),
  P("gff_inv_mark_paid", 4, { uid: "18", num: "x", paid: "1" }),
  A("dashboard", 1),

  /* ---- route flag, dispatch ---- */
  P("gff_route_toggle", 1, { uid: "28" }), P("gff_route_toggle", 1, { uid: "28" }), P("gff_route_toggle", 1, { uid: "29" }), P("gff_route_toggle", 4, { uid: "28" }),
  P("gff_dispatch_consult", 30, { did: MSG_ID }),
  P("gff_dispatch_assign", 1, { did: MSG_ID, assign_to: "33" }), P("gff_dispatch_assign", 1, { did: MSG_ID, assign_to: "0" }),
  P("gff_dispatch_forward", 1, { did: MSG_ID, forward_to: "30" }), P("gff_dispatch_forward", 1, { did: "nope", forward_to: "30" }), P("gff_dispatch_forward", 1, { did: MSG_ID }),
  P("gff_dispatch_consult", 4, { did: MSG_ID }),
  A("dashboard", 1),

  /* ---- client status, notes, tiers, conversion, deletion, garden invite ---- */
  P("gff_client_toggle_active", 30, { uid: "27" }), P("gff_client_toggle_active", 30, { uid: "27" }),
  P("gff_client_save_notes", 1, { uid: "27", gff_notes: "Gate code 1234\n<b>dog</b>" }), P("gff_client_save_notes", 1, { uid: "27" }),
  P("gff_lead_make_customer", 1, { uid: "29" }), P("gff_lead_make_customer", 1, { uid: "29" }),
  P("gff_client_setclass", 1, { uid: "4", klass: "customer", plan: "Spire" }), P("gff_client_setclass", 1, { uid: "4", klass: "lead" }),
  P("gff_client_setclass", 1, { uid: "4", klass: "seed", plan: "both" }), P("gff_client_setclass", 1, { uid: "4", klass: "vip" }), P("gff_client_setclass", 1, { uid: "999", klass: "lead" }),
  P("gff_client_setclass", 1, { uid: "29", klass: "customer", plan: "both" }),
  P("gff_send_garden_invite", 30, { uid: "24" }), P("gff_send_garden_invite", 1, { uid: "999" }),
  { uid: 0, action: "@option", post: { gff_garden_url: "https://gawlakfamilyfarms.com/garden/?from=mail", gff_reg_msg_recipient: "not-an-email" }, tag: "adminpost" },
  P("gff_send_garden_invite", 1, { uid: "18" }),
  P("gff_client_delete", 30, { uid: "28" }), P("gff_client_delete", 1, { uid: "1" }), P("gff_client_delete", 1, { uid: "33" }), P("gff_client_delete", 1, { uid: "28" }),
  A("clients", 1), A("dashboard", 1),

  /* ---- the profile panels saved ---- */
  { uid: 1, action: "@admin:save:4", tag: "profile", post: {
    gff_addons: ["starfruit", "BOGUS", "strawberry", "starfruit"], gff_addons_notes: "more <i>please</i>", gff_offer: "Spire", gff_phone: " 555 ", gff_service_address: "9 New Rd",
    gff_service_city: "Vero", gff_service_zip: "32960", gff_start_sqft: "300", gff_tower_qty: "-3", gff_start_date: "2026-12-24", gff_reservation: "workshop", gff_reservation_amount: "$12.5",
    gff_reservation_paid: "yes", gff_rate_lock: "yes", gff_inv_amount: "45.678", gff_inv_overview: "Monthly\nservice", gff_inv_spire_rate: "$100/mo", gff_inv_sqft_rate: "0.1x",
    gff_send_invoice: "1", gff_invoice_nonce: "n" } },
  A("profile:4", 1),
  { uid: 1, action: "@admin:save:4", tag: "profile", post: { gff_offer: "bogus", gff_reservation: "bogus", gff_inv_amount: "", gff_send_invoice: "1" } },   // no nonce: no invoice
  { uid: 30, action: "@admin:save:30", tag: "profile", post: { gff_phone: "772-555-0111", gff_offer: "spire" } },                                         // staff: only their own phone
  { uid: 1, action: "@admin:save:1", tag: "profile", post: { gff_phone: "+1 (772) 555-0100" } },
  { uid: 1, action: "@admin:save:18", tag: "profile", post: { gff_v33_start: "1", gff_v33_start_nonce: "n", gff_consult_paid: "yes" } },               // start service: $522 build balance
  { uid: 1, action: "@admin:save:18", tag: "profile", post: { gff_v33_start: "1", gff_v33_start_nonce: "n" } },                                          // already running
  A("profile:18", 1, {}, "profile"),
  { uid: 1, action: "@admin:save:27", tag: "profile", post: { gff_v33_start: "1", gff_v33_start_nonce: "n" } },                                          // no consult credit: $772
  { uid: 1, action: "@admin:save:27", tag: "profile", post: { gff_v33_stop: "1", gff_v33_stop_nonce: "n", gff_consult_paid: "yes" } },
  { uid: 1, action: "@admin:save:27", tag: "profile", post: { gff_v33_stop: "1" } },                                                                     // no nonce: nothing
  A("profile:27", 1, {}, "profile"),

  /* ---- the daily invoice cycle ---- */
  { uid: 0, action: "@job:gff_v33_cron", tag: "cron" },                                     // nobody due yet
  M(18, { gff_next_invoice_ts: "1795150000" }, "cron"), M(24, { gff_service_active: "yes", gff_next_invoice_ts: "1795100000" }, "cron"),
  M(29, { gff_service_active: "yes" }, "cron"),
  { uid: 0, action: "@job:gff_v33_cron", tag: "cron" },
  { uid: 0, action: "@job:gff_v33_cron", tag: "cron" },                                     // the next is a month out

  /* ---- GFF Settings saved (options.php) ---- */
  { uid: 30, action: "@options", post: { gff_reg_paypal_link: "x" }, tag: "settings" },
  { uid: 1, action: "@options", referer: "https://gawlakfamilyfarms.com/wp-admin/admin.php?page=gff-settings", tag: "settings",
    post: { gff_reg_paypal_link: " javascript:alert(1) ", gff_pay_paypal_me: " paypal.me/farm ", gff_pay_ach: "Bank <b>X</b>\nRouting 1", gff_reg_msg_recipient: " Owner@Example.COM " } },
  { uid: 1, action: "@options", post: { gff_reg_paypal_link: "https://www.paypal.me/farm" }, tag: "settings" },
  A("settings", 1, { "settings-updated": "true" }, "settings"),

  /* ---- GFF Drive Backup: the nightly Sheet export ---- */
  A("drive", 1, {}, "drive"), A("drive", 30, {}, "drive"),
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // no key yet: skipped
  { uid: 0, action: "@option", post: { gff_dbk_sa_json: SA }, tag: "drive" },
  A("drive", 1, {}, "drive"),
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // token, clear, write, the tab created, archive
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // the tab is there now
  { uid: 1, action: "@admin:drive", post: { gff_dbk_run_now: "1", _wpnonce: "n" }, tag: "drive" },
  { uid: 0, action: "@option", post: { gff_dbk_target_file_id: "locked-sheet" }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // the clear is refused
  { uid: 0, action: "@option", post: { gff_dbk_target_file_id: "full-sheet" }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // the write is refused
  { uid: 0, action: "@option", post: { gff_dbk_target_file_id: "tabless-sheet" }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // the tab cannot be added: written anyway
  { uid: 0, action: "@option", post: { gff_dbk_sa_json: SA_BAD }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // Google refuses the token
  { uid: 0, action: "@option", post: { gff_dbk_sa_json: " " + J({ client_email: "only@example.com" }) }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // no private key
  { uid: 0, action: "@option", post: { gff_dbk_sa_json: " " + J({ client_email: "backup@gff-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----" }) }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // the key cannot sign
  { uid: 30, action: "@options", post: { option_page: "gff_dbk_group", gff_dbk_target_file_id: "x" }, tag: "drive" },
  { uid: 1, action: "@options", referer: "https://gawlakfamilyfarms.com/wp-admin/tools.php?page=gff-drive-backup", tag: "drive",
    post: { option_page: "gff_dbk_group", gff_dbk_target_file_id: " sheet-2 <b>x</b> ", gff_dbk_folder_id: "folder %41 1" } },
  { uid: 0, action: "@option", post: { gff_dbk_sa_json: SA }, tag: "drive" },          // (the plugin's form also re-posts the key; the Worker's has no key field)
  A("drive", 1, { "settings-updated": "true" }, "drive"),
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },
  { uid: 0, action: "@option", post: { gff_dbk_target_file_id: "" }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },                            // no Sheet: skipped
];
