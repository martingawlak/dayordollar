/**
 * The client admin's screens (gff-customer-registration.php §11–18, 33):
 * GFF Clients, GFF Settings, the user-profile panels, and the Dispatch
 * dashboard the account page shows staff and admins, with their row forms.
 * The fixed markup is the plugin's own (scripts/gen-admin.php →
 * chunks.gen.ts), interleaved with the values the PHP echoed. Checked by
 * test/actions.parity.ts (@admin steps).
 *
 * Not ported: gff_active_toggle_form, gff_lead_convert_form,
 * gff_route_toggle_btn and gff_dash_service_summary — nothing in the plugin
 * calls them (their admin-post handlers are ported).
 */
import { adminUrl, type Ctx, loadUser, logoutUrl, meta, nonce, opt, type User } from "../ctx";
import { esc, escTextarea, escUrl, gmdate, numberFormat, phpInt, phpNum, phpRound, rawurlencode, truthy as t } from "../php";
import { isEmail } from "../wpfn";
import { agreementVersion, addons, reservationMeta, towerAddlPrice, towerFirstPrice } from "../forms/catalog";
import { isArr, phpJsonDecode, str } from "../forms/express";
import { type AdminCtx, can, canManageClients, getUsers, mysql2date } from "./core";
import { nonceField } from "../render/account";
import {
  classLabel, classOf, type ClientRow, collectClients, invOpenEntries, invOutstandingTotal, ms, nl2br, paidPlanOf, payMethods, ucfirst,
  v33BuildBalance, v33Consult, v33CycleDays, v33Monthly, v33StartTotal,
} from "./clients";
import {
  collectDispatches, dashTel, dispatchAgeClass, dispatchAgo, dispatchStatusAll, fmtDuration, geocodeCached, routeActiveStops, routeDirections,
  routeMapsUrl, routeOptimize, routeOrigin, routePreviewSvg, type Stop,
} from "./dispatch";
import * as K from "./chunks.gen";

const postUrl = (c: Ctx) => escUrl(adminUrl(c, "admin-post.php"));
const checked = (a: unknown, b: unknown = true) => (str(a) === str(b) ? " checked='checked'" : "");
const selected = (a: unknown, b: unknown = true) => (str(a) === str(b) ? " selected='selected'" : "");
/** esc_js() as WordPress's stand-in in the bench (htmlspecialchars ENT_COMPAT, addslashes, newlines as \n). */
export const escJs = (s: unknown) => str(s)
  .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)|[<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[ch])
  .replace(/[\\'"\0]/g, (ch) => (ch === "\0" ? "\\0" : "\\" + ch)).replace(/\r/g, "").replace(/\n/g, "\\n");
/** get_edit_user_link(). */
const editUserLink = (c: Ctx, id: number) => (id === c.uid ? adminUrl(c, "profile.php") : adminUrl(c, "user-edit.php?user_id=" + id));
/** The plugin's farm-layout lines (towers, else the seasonal bed). */
function layoutLines(raw: string, tower: (s: string) => string, bed: (s: string) => string, cast: boolean): string {
  if (raw === "") return "";
  const ly = phpJsonDecode(raw);
  if (!isArr(ly)) return "";
  let o = "";
  const nonEmpty = (v: unknown) => v !== undefined && v !== null && v !== false && v !== "" && v !== "0" && v !== 0 && !(isArr(v) && Object.keys(v).length === 0);
  if (nonEmpty(ly.towers)) {
    for (const tw of Object.values(ly.towers) as any[]) {
      const plants = cast ? (isArr(tw?.plants) ? Object.values(tw.plants) : nonEmpty(tw?.plants) ? [tw.plants] : []) : isArr(tw?.plants) ? Object.values(tw.plants) : [];
      const pl = nonEmpty(tw?.plants) ? plants.map((p) => esc(str(p))).join(", ") : "(empty)";
      o += tower("<strong>Tower " + phpInt(tw?.tower ?? 0) + ":</strong> " + pl);
    }
  } else if (nonEmpty(ly.seasonal_spots)) {
    const spots = isArr(ly.seasonal_spots) ? Object.values(ly.seasonal_spots) : [ly.seasonal_spots];
    o += bed("<strong>Seasonal bed:</strong> " + esc(spots.map((x) => str(x)).join(", ")));
  }
  return o;
}

/* ---- Row forms ---- */
/** gff_client_notes_form(). */
export async function notesForm(c: Ctx, id: number): Promise<string> {
  const T = K.NOTES_FORM_T;
  return T[0] + postUrl(c) + T[1] + id + T[2] + nonceField(c, "gff_client_notes_" + id, "_wpnonce") + T[3] + escTextarea(await ms(c, id, "gff_notes")) + T[4];
}
/** gff_client_delete_form(): admins only. */
export function deleteForm(c: Ctx, id: number, style = "front"): string {
  if (!can(c, "delete_users")) return "";
  const T = K.DELETE_FORM_T;
  const cls = style === "admin" ? "button button-small" : "gff-dash__mini";
  return T[0] + postUrl(c) + T[1] + id + T[2] + nonceField(c, "gff_client_delete_" + id, "_wpnonce") + T[3] + esc(cls) + T[4] + ' style="color:#a00;border-color:#e0b4b4;margin-left:8px;"' + T[5];
}
/** gff_class_btn(): one tier move. */
export function classBtn(c: Ctx, uid: number, klass: string, label: string, style = "front", go = false, plan = ""): string {
  const T = K.CLASS_BTN_T;
  const cls = style === "admin" ? "button button-small" + (go ? " button-primary" : "") : "gff-dash__mini" + (go ? " gff-dash__mini--go" : "");
  let o = T[0] + postUrl(c) + T[1] + uid + T[2] + esc(klass) + T[3];
  if (plan !== "") o += T[4] + esc(plan) + T[5];
  return o + T[6] + nonceField(c, "gff_setclass_" + uid, "_wpnonce") + T[7] + esc(cls) + T[8] + esc(label) + T[9];
}
/** gff_class_actions(): the contextual tier moves. */
export async function classActions(c: Ctx, id: number, style = "front"): Promise<string> {
  const k = await classOf(c, id);
  if (k === "customer") {
    const plan = await paidPlanOf(c, id);
    return '<span class="gff-plan-label">Plan:</span> '
      + classBtn(c, id, "customer", "Sunrise", style, plan === "sunrise", "sunrise") + classBtn(c, id, "customer", "Spire", style, plan === "spire", "spire")
      + classBtn(c, id, "customer", "Both", style, plan === "both", "both") + classBtn(c, id, "seed", "Move to Free Seeds", style);
  }
  let o = '<span class="gff-plan-label">Make paid:</span> '
    + classBtn(c, id, "customer", "Sunrise", style, true, "sunrise") + classBtn(c, id, "customer", "Spire", style, true, "spire") + classBtn(c, id, "customer", "Both", style, true, "both");
  if (k === "lead") o += classBtn(c, id, "seed", "Move to Free Seeds", style);
  return o;
}
/** gff_garden_invite_btn(). */
export function gardenInviteBtn(c: Ctx, uid: number, style = "front"): string {
  const T = K.GARDEN_BTN_T;
  return T[0] + postUrl(c) + T[1] + uid + T[2] + nonceField(c, "gff_garden_invite_" + uid, "_wpnonce") + T[3] + esc(style === "admin" ? "button button-small" : "gff-dash__mini") + T[4];
}
/** gff_client_messages_html(). */
export async function messagesHtml(c: Ctx, id: number): Promise<string> {
  const msgs = await meta(c, id, "gff_acct_messages");
  const list = isArr(msgs) ? Object.values(msgs) as any[] : [];
  if (!list.length) return "";
  let o = '<details class="gff-dash__ex"><summary>&#128172; Messages (' + list.length + ')</summary><div class="gff-dash__exbody">';
  for (const m of list) {
    const t = m?.time !== undefined && m?.time !== null ? str(m.time) : "";
    o += '<div class="gff-dash__msg"><span class="gff-dash__msgtime">' + esc(t) + "</span><br>" + nl2br(esc(m?.msg !== undefined && m?.msg !== null ? str(m.msg) : "")) + "</div>";
  }
  return o + "</div></details>";
}
/** gff_client_plants_html(). */
export function plantsHtml(row: ClientRow): string {
  const crops = row.crops;
  const layout = layoutLines(row.farm_layout, (s) => "<div>" + s + "</div>", (s) => "<div>" + s + "</div>", true);
  if (!crops.length && layout === "") return "";
  let o = '<details class="gff-dash__ex"><summary>&#127793; Plant choices' + (crops.length ? " (" + crops.length + ")" : "") + '</summary><div class="gff-dash__exbody">';
  if (crops.length) o += "<div>" + esc(crops.join(", ")) + "</div>";
  return o + layout + "</div></details>";
}
/** gff_client_planting_html(): the sown checklist. */
export async function plantingHtml(c: Ctx, row: ClientRow): Promise<string> {
  const crops = [...new Set(row.crops.map((x) => str(x)).filter((x) => x !== "" && x !== "0"))];
  if (!crops.length) return "";
  const rid = row.id;
  const p0 = await meta(c, rid, "gff_crops_planted");
  const planted: Record<string, any> = isArr(p0) ? (p0 as Record<string, any>) : {};
  const on = (crop: string) => { const v = planted[crop]; return !(v === undefined || v === null || v === "" || v === "0" || v === 0 || v === false); };
  const done = crops.filter(on).length;
  const T = K.PLANTING_T;
  let o = T[0] + rid + T[1] + esc(nonce("gff_crop_toggle_" + rid)) + T[2] + done + T[3] + crops.length + T[4];
  for (const crop of crops) {
    o += T[5] + esc(crop) + T[6] + checked(on(crop)) + T[7] + esc(crop) + T[8] + (on(crop) ? esc("sown " + mysql2date("M j", planted[crop])) : "") + T[9];
  }
  return o + T[10];
}
/** gff_dash_invoice_form(): invoice a paid client from the dashboard; their open invoices with Mark paid. */
export async function dashInvoiceForm(c: Ctx, row: ClientRow): Promise<string> {
  if (!isEmail(row.email)) return '<span style="color:#a8562a;">no email</span>';
  const rid = row.id;
  const amt = esc(await ms(c, rid, "gff_inv_amount"));
  const ovw = escTextarea(await ms(c, rid, "gff_inv_overview"));
  const open = await invOpenEntries(c, rid);
  const T = K.DASH_INVOICE_T;
  let o = T[0] + rid + T[1];
  if (open.length) {
    o += T[2] + open.length + T[3] + esc(numberFormat(await invOutstandingTotal(c, rid), 2)) + T[4];
    for (const e of open) {
      o += T[5] + esc(str(e.num)) + T[6] + esc(str(e.amount)) + T[7] + esc(str(mysql2date("M j", e.sent_at))) + T[8] + postUrl(c) + T[9] + rid + T[10] + esc(str(e.num)) + T[11]
        + nonceField(c, "gff_inv_mark_" + rid + "_" + str(e.num), "_wpnonce") + T[12];
    }
    o += T[13];
  }
  return o + T[14] + postUrl(c) + T[15] + rid + T[16] + rid + T[17] + nonceField(c, "gff_send_invoice_row_" + rid, "_wpnonce") + T[18] + amt + T[19] + ovw + T[20] + escJs(row.email) + T[21] + esc(row.email) + T[22];
}
/** gff_dash_client_section(): one tier's table. */
export async function dashClientSection(c: Ctx, title: string, rows: ClientRow[], isFull: boolean, headerExtra = ""): Promise<string> {
  const T = K.CLIENT_SECTION_T;
  let o = T[0] + esc(title) + T[1] + rows.length + T[2] + headerExtra + T[3];
  if (!rows.length) return o + T[4] + T[23];
  o += T[5];
  for (const r of rows) {
    const tel = dashTel(r.phone);
    const klass = await classOf(c, r.id);
    const badge = klass === "customer" ? "Paid · " + ucfirst(await paidPlanOf(c, r.id)) : classLabel(klass);
    o += T[6] + esc(t(r.name) ? r.name : "(no name)") + T[7] + esc(klass) + T[8] + esc(badge) + T[9];
    const owed = await invOutstandingTotal(c, r.id);
    if (owed > 0) o += T[10] + esc(numberFormat(owed, 2)) + T[11];
    o += T[12] + esc(r.email) + T[13] + esc(r.email) + T[14];
    if (t(tel)) o += T[15] + esc(tel) + T[16] + esc(tel) + T[17];
    o += T[18];
    if (r.address.trim() !== "") o += esc((r.address + ", " + r.city + " " + r.zip).trim());
    else if (r.lead_city !== "" && r.lead_city !== "0") o += "<em>" + esc(r.lead_city) + "</em>";
    else o += "&mdash;";
    o += T[19] + (await classActions(c, r.id, "front")) + gardenInviteBtn(c, r.id, "front");
    if (klass === "customer" && isFull) o += await dashInvoiceForm(c, r);
    o += deleteForm(c, r.id, "front");
    o += T[20] + plantsHtml(r) + (await plantingHtml(c, r)) + (await messagesHtml(c, r.id)) + (await notesForm(c, r.id)) + T[21];
  }
  return o + T[22] + T[23];
}

/** gff_admin_dashboard(): the Dispatch view of [gff_account] for staff and admins. '' for anyone else. */
export async function adminDashboard(c: AdminCtx): Promise<string> {
  if (!canManageClients(c)) return "";
  const isFull = canManageClients(c);
  const me = c.user!;
  const admins = await getUsers(c, { role__in: ["administrator", "gff_staff"], orderby: "display_name" });
  const clients = await collectClients(c);
  const disp = isFull ? await collectDispatches(c) : [];
  const status = dispatchStatusAll(c);
  const g = (k: string) => { const v = (c.get ?? {})[k]; return v === undefined ? undefined : Array.isArray(v) ? "Array" : v; };
  const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  let notice = "";
  const nt = (cls: string, msg: string) => '<div class="gff-acct__notice gff-acct__notice--' + cls + '">' + esc(msg) + "</div>";
  if (g("gff_dnote") !== undefined) {
    const map: Record<string, [string, string]> = { consulted: ["ok", "Marked consulted."], assigned: ["ok", "Dispatch assigned."], forwarded: ["ok", "Forwarded to the team member."], invsent: ["ok", "Invoice emailed."], err: ["warn", "That action could not be completed."] };
    const m = map[key(g("gff_dnote")!)];
    if (m) notice = nt(...m);
  }
  if (notice === "" && g("gff_inv") !== undefined) {
    const imp: Record<string, [string, string]> = { sent: ["ok", "Invoice emailed."], failed: ["warn", "Invoice could not be sent."], noamount: ["warn", "Enter an invoice amount first."], baduser: ["warn", "That customer has no valid email."] };
    const m = imp[key(g("gff_inv")!)];
    if (m) notice = nt(...m);
  }
  if (notice === "" && g("gff_cnote") !== undefined) {
    const cmap: Record<string, [string, string]> = { converted: ["ok", "Lead converted to customer."], classed: ["ok", "Tier updated."], invited: ["ok", "Garden invite emailed."], deleted: ["ok", "Deleted."], invpaid: ["ok", "Invoice marked paid — archived."], invopen: ["ok", "Invoice reopened."], err: ["warn", "That action could not be completed."], saved: ["ok", "Saved."] };
    notice = nt(...(cmap[key(g("gff_cnote")!)] ?? ["ok", "Saved."]));
  }
  let adminOptions = "";
  for (const a of admins) adminOptions += '<option value="' + a.ID + '">' + esc(a.display_name) + "</option>";

  const T = K.DASHBOARD_T;
  let o = T[0] + esc(me.display_name) + T[1] + (can(c, "manage_options") ? "admin view" : "staff view") + T[2] + notice + T[3];
  if (isFull) {
    o += T[4] + disp.length + T[5];
    if (!disp.length) o += T[6];
    else {
      for (const d of disp) {
        const st = isArr(status[d.id]) ? status[d.id] : {};
        const consulted = t(st.consulted_at);
        const cls = dispatchAgeClass(c, d.time, consulted);
        const tel = dashTel(d.phone);
        const uname = async (id: unknown) => { const u = phpInt(id) ? await loadUser(c.env, phpInt(id)) : null; return u ? u.display_name : "&mdash;"; };
        o += T[7] + esc(cls) + T[8] + esc(d.type_label) + T[9] + esc(d.name) + T[10] + esc(dispatchAgo(c, d.time)) + T[11];
        if (consulted) o += T[12] + esc(await uname(st.consulted_by)) + T[13];
        o += T[14];
        if (t(st.assigned_to)) o += T[15] + esc(await uname(st.assigned_to)) + T[16];
        o += T[17] + esc(d.summary) + T[18];
        if (t(tel)) o += T[19] + esc(tel) + T[20] + esc(tel) + T[21];
        o += T[22] + esc(d.email) + T[23];
        if (!consulted) o += T[24] + postUrl(c) + T[25] + esc(d.id) + T[26] + nonceField(c, "gff_dispatch_" + d.id, "_wpnonce") + T[27];
        o += T[28] + postUrl(c) + T[29] + esc(d.id) + T[30] + nonceField(c, "gff_dispatch_" + d.id, "_wpnonce") + T[31] + adminOptions
          + T[32] + postUrl(c) + T[33] + esc(d.id) + T[34] + nonceField(c, "gff_dispatch_" + d.id, "_wpnonce") + T[35] + adminOptions + T[36];
      }
    }
    o += T[37];
    let stops = await routeActiveStops(c, clients);
    let missing: number;
    [stops, missing] = await routeOptimize(c, stops);
    const groups: Stop[][] = [];
    for (let i = 0; i < stops.length; i += 9) groups.push(stops.slice(i, i + 9));
    const originCoords = await geocodeCached(c, routeOrigin(c), { n: 2 });
    const osrm = { n: 4 };
    o += T[38] + stops.length + T[39];
    if (groups.length) {
      o += T[40] + esc(routeOrigin(c)) + T[41] + stops.length + T[42] + groups.length + T[43] + (groups.length > 1 ? "s" : "") + T[44];
      if (missing) o += T[45] + missing + T[46] + (missing > 1 ? "es" : "") + T[47];
      o += T[48];
      for (const [gi, group] of groups.entries()) {
        const dir = await routeDirections(c, originCoords, group, osrm);
        o += T[49];
        if (dir && dir.points && dir.points.length) {
          o += T[50] + routePreviewSvg(dir, group, originCoords) + T[51] + esc(routeOrigin(c)) + T[52] + esc(fmtDuration(dir.duration)) + T[53]
            + esc(phpNum(phpRound(dir.distance / 1609.34, 1))) + T[54] + group.length + T[55];
        } else o += T[56];
        o += T[57] + escUrl(routeMapsUrl(c, group)) + T[58] + (gi + 1) + T[59] + group.length + T[60];
        for (const s of group) o += T[61] + rawurlencode(s.addr) + T[62] + esc(s.name) + T[63] + esc(s.addr) + T[64];
        o += T[65];
      }
      o += T[66];
    } else {
      o += T[67] + esc(routeOrigin(c)) + T[68];
    }
    o += T[69];
  }
  o += T[70];
  const gLeads: ClientRow[] = [], gSeeds: ClientRow[] = [], gPaid: ClientRow[] = [];
  for (const cl of clients) {
    const k = await classOf(c, cl.id);
    if (k === "lead") gLeads.push(cl); else if (k === "seed") gSeeds.push(cl); else gPaid.push(cl);
  }
  o += T[71] + (await dashClientSection(c, "Paid Clients", gPaid, isFull)) + T[72];
  const seedsUrl = esc(addNonce(adminUrl(c, "admin-post.php?action=gff_export_seeds_mailer"), "gff_export_seeds_mailer"));
  const seedsBtn = '<a class="gff-dash__mini" href="' + escUrl(seedsUrl) + '" style="margin-bottom:8px;">&#11015;&#65039; Export for mailer (CSV)</a>';
  o += (await dashClientSection(c, "Free Seeds Customers", gSeeds, isFull, seedsBtn)) + T[73] + (await dashClientSection(c, "Leads", gLeads, isFull)) + T[74];
  if (isFull) {
    o += T[75];
    for (const a of admins) {
      const ap = dashTel(await meta(c, a.ID, "gff_phone"));
      o += T[76] + esc(a.display_name) + T[77] + esc(a.user_email) + T[78] + esc(a.user_email) + T[79];
      o += t(ap) ? T[80] + esc(ap) + T[81] + esc(ap) + T[82] : T[83];
      o += T[84];
    }
    o += T[85] + escUrl(adminUrl(c, "profile.php")) + T[86];
  }
  o += T[87] + escUrl(logoutUrl()) + T[88] + escJs(adminUrl(c, "admin-ajax.php")) + T[89] + K.ACCT_CSS + K.DASH_CSS + T[90];
  return o;
}
/** wp_nonce_url()'s query part, before its esc_html(). */
const addNonce = (url: string, action: string) => url + (url.includes("?") ? "&" : "?") + "_wpnonce=" + nonce(action);

/* ---- GFF Clients (wp-admin) ---- */
export async function clientsPage(c: AdminCtx): Promise<string | { die: string }> {
  if (!can(c, "list_users")) return { die: "You do not have permission to view this page." };
  const rows = await collectClients(c);
  const count = rows.length;
  const customers = rows.filter((r) => r.role !== "Lead");
  const leads = rows.filter((r) => r.role === "Lead");
  const exportUrl = esc(addNonce(adminUrl(c, "admin-post.php?action=gff_export_clients"), "gff_export_clients"));
  const g = (k: string) => { const v = c.get[k]; return v === undefined ? undefined : Array.isArray(v) ? "Array" : v; };
  const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  let o = "";
  if (g("gff_inv") !== undefined) {
    const code = key(g("gff_inv")!);
    const amt = g("gff_inv_amt") !== undefined ? g("gff_inv_amt")!.replace(/[^0-9.]/g, "") : "";
    if (code === "sent") o += '<div class="notice notice-success is-dismissible"><p>Invoice emailed' + (amt !== "" ? " for $" + esc(amt) : "") + ".</p></div>";
    else if (code === "failed") o += '<div class="notice notice-error is-dismissible"><p>Invoice could not be sent. Check WP Mail SMTP settings and try again.</p></div>';
    else if (code === "noamount") o += '<div class="notice notice-error is-dismissible"><p>Enter an amount greater than $0 before sending.</p></div>';
    else if (code === "baduser") o += '<div class="notice notice-error is-dismissible"><p>That customer has no valid email on file.</p></div>';
  }
  if (g("gff_cnote") !== undefined) {
    const cmap: Record<string, [string, string]> = { converted: ["success", "Lead converted to customer."], classed: ["success", "Tier updated."], invited: ["success", "Garden invite emailed."], deleted: ["success", "Deleted."], err: ["error", "That action could not be completed."], saved: ["success", "Saved."] };
    const m = cmap[key(g("gff_cnote")!)] ?? ["success", "Saved."];
    o += '<div class="notice notice-' + m[0] + ' is-dismissible"><p>' + esc(m[1]) + "</p></div>";
  }
  const T = K.CLIENTS_T;
  const editUsers = can(c, "edit_users");
  o += T[0] + count + T[1] + escUrl(exportUrl) + T[2];
  if (!count) return o + T[3] + T[71];
  o += T[4] + (editUsers ? T[5] : "") + T[6];
  for (const r of customers) {
    const rk = await classOf(c, r.id);
    o += T[7] + esc(rk === "customer" ? "Paid · " + ucfirst(await paidPlanOf(c, r.id)) : classLabel(rk)) + T[8] + (await classActions(c, r.id, "admin"))
      + T[9] + (r.role === "Customer" ? "#1c1c1a" : "#7a4f00") + T[10] + esc(r.role) + T[11] + esc(t(r.name) ? r.name : "(no name)") + T[12] + escUrl(editUserLink(c, r.id))
      + T[13] + esc(r.email) + T[14] + esc(r.email) + T[15];
    if (t(r.phone)) o += T[16] + esc(r.phone);
    o += T[17];
    if (r.address !== "" && r.address !== "0") o += T[18] + esc(r.address) + T[19] + esc((r.city + " " + r.zip).trim()) + T[20];
    else if (r.lead_city !== "" && r.lead_city !== "0") o += T[21] + esc(r.lead_city) + T[22];
    else o += T[23];
    o += T[24] + (r.sqft !== "" ? esc(r.sqft) : "&mdash;") + T[25];
    if (r.start_date !== "" && r.start_date !== "0") o += T[26] + esc(r.start_date) + T[27];
    o += T[28];
    const res = r.reservation;
    if (res === "" || res === "none") o += "&mdash;";
    else {
      o += "<strong>" + esc(reservationMeta(c, res).label) + "</strong>";
      if (r.reservation_paid === "yes") {
        o += '<br><span style="color:#1c1c1a;font-weight:700;">&#10003; paid</span>';
        if (r.reservation_txn !== "" && r.reservation_txn !== "0") o += '<br><span style="font-size:11px;">txn: ' + esc(r.reservation_txn) + "</span>";
        if (r.reservation_paid_at !== "" && r.reservation_paid_at !== "0") o += '<br><span style="font-size:11px;color:#5F5E5A;">' + esc(r.reservation_paid_at) + "</span>";
      } else o += '<br><span style="color:#7a2417;font-weight:700;">awaiting payment</span>';
      if (r.reservation_credited === "yes") o += '<br><span style="font-size:11px;color:#1c1c1a;">credited &#10003;</span>';
    }
    o += T[29];
    if (r.addons === "") o += "&mdash;";
    else {
      o += "<details><summary><strong>$" + esc(r.addons_total) + '</strong></summary><div style="margin-top:.4em;font-size:12px;line-height:1.6;">' + esc(r.addons) + "</div></details>";
      o += r.addons_invoiced === "yes" ? '<span style="font-size:11px;color:#1c1c1a;font-weight:700;">&#10003; invoiced</span>' : '<span style="font-size:11px;color:#7a2417;font-weight:700;">to invoice</span>';
    }
    o += T[30];
    const n = r.crops.length;
    o += n ? "<details><summary>" + n + ' selected</summary><div style="margin-top:.4em;font-size:12px;line-height:1.6;">' + esc(r.crops.join(", ")) + "</div></details>" : "&mdash;";
    if (r.farm_layout !== "" && r.farm_layout !== "0" && isArr(phpJsonDecode(r.farm_layout))) {
      o += '<details style="margin-top:.4em;"><summary style="color:#1c1c1a;font-weight:600;">🌱 Farm layout</summary><div style="margin-top:.4em;font-size:12px;line-height:1.6;">'
        + layoutLines(r.farm_layout, (s) => s + "<br>", (s) => s, false) + "</div></details>";
    }
    if (r.moringa_upgrade === "yes") o += '<div style="margin-top:.3em;font-size:11px;color:#c98b2a;font-weight:600;">🌳 Moringa→fruit tree (+$100, invoice later)</div>';
    o += T[31];
    o += r.agr_when !== "" && r.agr_when !== "0" ? T[32] + esc(r.agr_ver) + T[33] + esc(r.agr_when) + T[34] + esc(r.agr_ip) + T[35] : T[36];
    o += T[37];
    if (editUsers) {
      const rid = r.id;
      const last = await ms(c, rid, "gff_inv_last_sent");
      o += T[38] + esc(rid) + T[39];
      if (last !== "" && last !== "0") o += T[40] + esc(last) + T[41];
      o += T[42] + postUrl(c) + T[43] + esc(rid) + T[44] + esc(rid) + T[45] + nonceField(c, "gff_send_invoice_row_" + rid, "_wpnonce") + T[46] + esc(await ms(c, rid, "gff_inv_amount"))
        + T[47] + escTextarea(await ms(c, rid, "gff_inv_overview")) + T[48] + escJs(r.email) + T[49] + esc(r.email) + T[50];
    }
    o += T[51] + (editUsers ? 11 : 10) + T[52] + (await messagesHtml(c, r.id)) + (await notesForm(c, r.id)) + deleteForm(c, r.id, "admin") + T[53];
  }
  o += T[54] + (editUsers ? T[55] : "") + T[56];
  if (!leads.length) o += T[57];
  else {
    o += T[58];
    for (const r of leads) {
      o += T[59] + (await classActions(c, r.id, "admin")) + T[60] + esc(t(r.name) ? r.name : "(no name)") + T[61] + escUrl(editUserLink(c, r.id)) + T[62] + esc(r.email) + T[63] + esc(r.email) + T[64];
      if (t(r.phone)) o += T[65] + esc(r.phone);
      o += T[66] + (r.lead_city !== "" && r.lead_city !== "0" ? esc(r.lead_city) : "&mdash;") + T[67] + (await messagesHtml(c, r.id)) + (await notesForm(c, r.id)) + deleteForm(c, r.id, "admin") + T[68];
    }
    o += T[69];
  }
  return o + T[70] + T[71];
}

/* ---- GFF Settings (wp-admin) ---- */
/** The settings the GFF Settings form saves (register_setting), with their sanitize callbacks. */
export const SETTINGS: [string, "esc_url_raw" | "sanitize_textarea_field" | "sanitize_email"][] = [
  ["gff_reg_paypal_link", "esc_url_raw"], ...Object.values(payMethods()).map((m) => [m.option, "sanitize_textarea_field"] as [string, "sanitize_textarea_field"]),
  ["gff_reg_msg_recipient", "sanitize_email"],
];
export function settingsPage(c: AdminCtx): string {
  if (!can(c, "manage_options")) return "";
  const T = K.SETTINGS_T;
  let o = T[0] + "<input type='hidden' name='option_page' value='gff_reg_settings_group' />" + '<input type="hidden" name="action" value="update" />' + nonceField(c, "gff_reg_settings_group-options", "_wpnonce") + T[1];
  // GFF_PAYPAL_LINK (a wp-config constant) was never defined: the editable field.
  o += T[4] + esc(str(opt(c, "gff_reg_paypal_link", "https://www.paypal.com/ncp/payment/YBGEYKG9KCFWC"))) + T[5] + T[6] + esc(agreementVersion()) + T[7];
  // do_action( 'gff_reg_settings_after' ): the payment methods, then the message recipient.
  const P = K.PAY_FIELDS_T;
  o += P[0];
  for (const m of Object.values(payMethods())) {
    const val = str(opt(c, m.option, ""));
    o += P[1] + esc(m.option) + P[2] + esc(m.label) + P[3];
    o += m.option === "gff_pay_ach" ? P[4] + esc(m.option) + P[5] + esc(m.option) + P[6] + escTextarea(val) + P[7] : P[8] + esc(m.option) + P[9] + esc(m.option) + P[10] + esc(val) + P[11];
    o += P[12] + esc(m.hint) + P[13];
  }
  o += P[14];
  let to = str(opt(c, "gff_reg_msg_recipient", "martingawlak@gmail.com"));
  if (to.trim() === "") to = "martingawlak@gmail.com";
  o += K.MSG_RECIPIENT_T[0] + esc(to) + K.MSG_RECIPIENT_T[1];
  o += T[8] + '<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" value="Save Changes"  /></p>' + T[9];
  return o;
}

/* ---- The user-profile panels ---- */
/** The plugin's panels on a user's profile, in hook order: add-ons, account inputs, invoice, contact phone, service & billing. */
export async function profilePanels(c: AdminCtx, user: User): Promise<string> {
  return (await addonFields(c, user)) + (await accountFields(c, user)) + (await invoiceFields(c, user)) + (await phoneField(c, user)) + (await v33Profile(c, user));
}
async function addonFields(c: Ctx, user: User): Promise<string> {
  if (!can(c, "edit_users")) return "";
  const sel0 = await meta(c, user.ID, "gff_addons");
  const selected0 = Array.isArray(sel0) ? sel0 : isArr(sel0) ? Object.values(sel0) : [];
  const T = K.ADDON_FIELDS_T;
  let o = T[0];
  for (const [key, ad] of Object.entries(addons())) {
    o += T[1] + esc(key) + T[2] + checked(selected0.includes(key)) + T[3] + esc(ad.emoji + " " + ad.name) + T[4] + esc(ad.price) + T[5];
    if (t(ad.paypal_url)) o += T[6] + escUrl(ad.paypal_url) + T[7];
    o += T[8];
  }
  return o + T[9] + escTextarea(await ms(c, user.ID, "gff_addons_notes")) + T[10];
}
async function accountFields(c: Ctx, user: User): Promise<string> {
  if (!can(c, "edit_users")) return "";
  const uid = user.ID;
  const g = async (k: string, d = "") => { const v = await meta(c, uid, k); return v === "" || v === null || v === undefined ? d : v; };
  const offer = await g("gff_offer"), flow = await g("gff_signup_flow"), reservation = await g("gff_reservation", "none");
  const T = K.ACCOUNT_FIELDS_T;
  let o = T[0] + selected(offer, "") + T[1] + selected(offer, "sunrise") + T[2] + selected(offer, "spire") + T[3] + esc(str(flow) ? str(flow) : "—")
    + T[4] + esc(str(await g("gff_phone"))) + T[5] + esc(str(await g("gff_service_address"))) + T[6] + esc(str(await g("gff_service_city"))) + T[7] + esc(str(await g("gff_service_zip")))
    + T[8] + esc(str(await g("gff_start_sqft"))) + T[9] + esc(str(await g("gff_tower_qty"))) + T[10] + esc(str(await g("gff_start_date"))) + T[11]
    + selected(reservation, "none") + T[12] + selected(reservation, "consult") + T[13] + T[14];
  if (reservation === "down_payment") o += T[15];
  o += T[16];
  if (reservation === "workshop") o += T[17];
  o += T[18] + esc(str(await g("gff_reservation_amount", "0.00"))) + T[19] + checked(await g("gff_reservation_paid", "no"), "yes") + T[20] + checked(await g("gff_rate_lock", "no"), "yes")
    + T[21] + checked(await g("gff_spire_unlocked", "no"), "yes") + T[22] + T[23];
  const req: any = await meta(c, uid, "gff_spire_unlock_request");
  if (isArr(req) && t(req.status)) o += T[24] + (req.status === "invoice_requested" ? "requested an invoice" : "clicked the PayPal $100 link") + T[25] + esc(str(req.time)) + T[26];
  return o + T[27] + checked(await meta(c, uid, "gff_workshop_interest"), "yes") + T[28];
}
async function invoiceFields(c: Ctx, user: User): Promise<string> {
  if (!can(c, "edit_users")) return "";
  const uid = user.ID;
  const first = towerFirstPrice(), addl = towerAddlPrice();
  let spireRate = await ms(c, uid, "gff_inv_spire_rate");
  if (spireRate === "") spireRate = String(first);
  let sqftRate = await ms(c, uid, "gff_inv_sqft_rate");
  if (sqftRate === "") sqftRate = "0.10";
  const last = await ms(c, uid, "gff_inv_last_sent");
  const T = K.INVOICE_FIELDS_T;
  let o = nonceField(c, "gff_send_invoice_" + uid, "gff_invoice_nonce") + T[0];
  if (last !== "" && last !== "0") o += T[1] + esc(last) + T[2];
  return o + T[3] + esc(phpInt(await meta(c, uid, "gff_tower_qty"))) + T[4] + esc(spireRate) + T[5] + esc(first) + T[6] + esc(addl) + T[7]
    + esc(phpInt((await ms(c, uid, "gff_start_sqft")).replace(/[^0-9]/g, ""))) + T[8] + esc(sqftRate) + T[9] + escTextarea(await ms(c, uid, "gff_inv_overview"))
    + T[10] + esc(await ms(c, uid, "gff_inv_amount")) + T[11] + escJs(user.user_email) + T[12] + esc(user.user_email) + T[13];
}
async function phoneField(c: Ctx, user: User): Promise<string> {
  return K.PHONE_FIELD_T[0] + esc(str(await meta(c, user.ID, "gff_phone"))) + K.PHONE_FIELD_T[1];
}
async function v33Profile(c: Ctx, user: User): Promise<string> {
  if (!can(c, "edit_users")) return "";
  const uid = user.ID;
  const active = (await meta(c, uid, "gff_service_active")) === "yes";
  const consultPaid = (await meta(c, uid, "gff_consult_paid")) === "yes";
  const nextTs = phpInt(await meta(c, uid, "gff_next_invoice_ts"));
  const cycles = phpInt(await meta(c, uid, "gff_invoice_cycles"));
  const balance = await v33BuildBalance(c, uid);
  const T = K.V33_PROFILE_T;
  let o = T[0] + checked(consultPaid) + T[1];
  if (active) {
    o += T[2] + cycles + T[3] + (cycles === 1 ? "" : "s") + T[4];
    if (nextTs) o += T[5] + esc(gmdate("M j, Y", nextTs)) + T[6] + esc(numberFormat(v33Monthly(), 2)) + T[7];
    o += T[8];
  } else o += T[9];
  o += T[10];
  if (!active) {
    o += T[11] + nonceField(c, "gff_v33_start_" + uid, "gff_v33_start_nonce") + T[12] + esc(numberFormat(v33StartTotal(), 2)) + T[13];
    if (consultPaid) o += T[14] + esc(numberFormat(v33Consult(), 2)) + T[15];
    o += T[16] + esc(numberFormat(balance, 2)) + T[17] + esc(numberFormat(balance, 2)) + T[18] + esc(numberFormat(v33Monthly(), 2)) + T[19] + v33CycleDays() + T[20];
  } else o += T[21] + nonceField(c, "gff_v33_stop_" + uid, "gff_v33_stop_nonce") + T[22];
  return o + T[23];
}
