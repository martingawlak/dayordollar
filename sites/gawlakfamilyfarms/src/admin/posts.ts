/**
 * The client admin's form posts (gff-customer-registration.php): the 14
 * admin-post.php handlers, the user-profile saves (personal_options_update /
 * edit_user_profile_update), the GFF Settings save (WordPress's options.php
 * for the plugin's registered settings), and the daily gff_v33_cron invoice
 * cycle. Same checks, same order, same redirects. Checked by
 * test/actions.parity.ts.
 */
import { type Ctx, deleteMeta, homeUrl, loadUser, meta, opt, setMeta, setOpt } from "../ctx";
import { die, has, p, pa, type Reply } from "../ajax";
import { esc, escUrl, gmdate, phpFloat, phpInt, rawurlencode, truthy } from "../php";
import { escUrlRaw, isEmail, sanitizeEmail, sanitizeKey, sanitizeTextareaField, sanitizeTextField } from "../wpfn";
import { randomCode, sendMail } from "../wp";
import { currentMysql, currentTs } from "../wpcore";
import { addons } from "../forms/catalog";
import { str } from "../forms/express";
import { addQueryArg, addRole, type AdminCtx, can, canManageClients, csvLine, deleteUser, FileReply, getReferer, getUsers, RedirectReply, removeRole } from "./core";
import { wpHash } from "../render/garden";
import { classOf, clientIsActive, collectClients, invMark, ms, nf2, sendInvoice, v33BuildBalance, v33Consult, v33CycleDays, v33Monthly, v33SendInvoice, v33StartTotal } from "./clients";
import { collectDispatches, dispatchStatusSet, geocodeCached } from "./dispatch";
import { SETTINGS } from "./views";
import { saveDbkSettings } from "./drive";

const DAY = 86400, YEAR = 31536000;
const back = (c: AdminCtx) => getReferer(c) || homeUrl(c, "/account/");
const postInt = (c: AdminCtx, k: string) => (has(c, k) ? phpInt(p(c, k)) : 0);
const money = (v: string) => nf2(phpFloat(v.replace(/[^0-9.]/g, "")));

/** gff_export_seeds_mailer: Free Seeds customers with a mailing address, as the Deck Mailer reads them. */
export async function exportSeedsMailer(c: AdminCtx): Promise<Reply> {
  if (!canManageClients(c)) return die("You do not have permission to export.");
  let out = csvLine(["name", "address", "city", "state", "zip"]);
  for (const r of await collectClients(c)) {
    if ((await classOf(c, r.id)) !== "seed") continue;
    const addr = r.address.trim();
    if (addr === "") continue;
    out += csvLine([r.name, addr, r.city, "FL", r.zip]);
  }
  return new FileReply(["Content-Type: text/csv; charset=utf-8", "Content-Disposition: attachment; filename=gff-free-seeds-" + gmdate("Y-m", c.now) + ".csv"], out);
}

/** gff_export_clients: every client, every field (list_users). */
export async function exportClients(c: AdminCtx): Promise<Reply> {
  if (!can(c, "list_users")) return die("You do not have permission to export client data.");
  let out = csvLine(["Role", "Name", "Email", "Phone", "Service Address", "City", "ZIP", "Start size", "Start Date", "Rate Lock", "Reservation", "Paid", "Txn ID", "Paid At", "Credited", "Add-ons", "Add-ons Total", "Add-ons Invoiced", "Crops Wanted", "Farm Layout", "Moringa Fruit Upgrade", "Workshop Interest", "Agreement Version", "Accepted At", "Accept IP", "Joined"]);
  for (const r of await collectClients(c)) {
    out += csvLine([r.role, r.name, r.email, r.phone, r.address, r.city, r.zip, r.sqft, r.start_date, r.ratelock, r.reservation, r.reservation_paid, r.reservation_txn,
      r.reservation_paid_at, r.reservation_credited, r.addons, r.addons_total, r.addons_invoiced, r.crops.join("; "), r.farm_layout, r.moringa_upgrade, r.workshop,
      r.agr_ver, r.agr_when, r.agr_ip, r.joined]);
  }
  return new FileReply(["Content-Type: text/csv; charset=utf-8", "Content-Disposition: attachment; filename=gff-clients-" + gmdate("Y-m-d", c.now) + ".csv"], out);
}

/** gff_send_invoice_row: invoice one client from the list. */
export async function sendInvoiceRow(c: AdminCtx): Promise<Reply> {
  if (!canManageClients(c)) return die("You do not have permission to send invoices.");
  const uid = postInt(c, "gff_inv_user");
  const redirect = getReferer(c) || c.origin + "/wp-admin/users.php?page=gff-clients";
  const user = await loadUser(c.env, uid);
  if (!user || !isEmail(user.user_email)) return new RedirectReply(addQueryArg({ gff_inv: "baduser" }, redirect));
  const amount = money(p(c, "gff_inv_amount"));
  const overview = sanitizeTextareaField(p(c, "gff_inv_overview"));
  if (phpFloat(amount) <= 0) return new RedirectReply(addQueryArg({ gff_inv: "noamount" }, redirect));
  await setMeta(c, uid, "gff_inv_amount", amount);
  await setMeta(c, uid, "gff_inv_overview", overview);
  const num = await sendInvoice(c, user, amount, overview);
  return new RedirectReply(num ? addQueryArg({ gff_inv: "sent", gff_inv_amt: rawurlencode(amount) }, redirect) : addQueryArg({ gff_inv: "failed" }, redirect));
}

/** gff_inv_mark_paid: flip one invoice paid / open. */
export async function invMarkPaid(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  const num = has(c, "num") ? sanitizeTextField(p(c, "num")) : "";
  const paid = has(c, "paid") && p(c, "paid") === "1";
  if (!canManageClients(c)) return die("Not allowed.");
  await invMark(c, uid, num, paid, c.uid);
  return new RedirectReply(addQueryArg({ gff_cnote: paid ? "invpaid" : "invopen" }, back(c)));
}

/** gff_route_toggle: a customer's route flag; switching on warms the geocode cache. */
export async function routeToggle(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  const now = (await meta(c, uid, "gff_route_active")) === "yes";
  await setMeta(c, uid, "gff_route_active", now ? "no" : "yes");
  if (!now) {
    const street = await ms(c, uid, "gff_service_address");
    const addr = (street + ", " + (await ms(c, uid, "gff_service_city")) + " " + (await ms(c, uid, "gff_service_zip"))).replace(/^[, \t\n\r\0\x0B]+|[, \t\n\r\0\x0B]+$/g, "");
    if (street.trim() !== "") await geocodeCached(c, addr, { n: 1 });
  }
  return new RedirectReply(back(c));
}

const dispatchRedirect = (c: AdminCtx, note: string) => new RedirectReply(addQueryArg({ gff_dnote: note }, back(c)));
/** gff_dispatch_consult. */
export async function dispatchConsult(c: AdminCtx): Promise<Reply> {
  const did = has(c, "did") ? sanitizeTextField(p(c, "did")) : "";
  if (!canManageClients(c)) return die("Not allowed.");
  await dispatchStatusSet(c, did, { consulted_by: c.uid, consulted_at: currentMysql(c) });
  return dispatchRedirect(c, "consulted");
}
/** gff_dispatch_assign: the assignee is emailed. */
export async function dispatchAssign(c: AdminCtx): Promise<Reply> {
  const did = has(c, "did") ? sanitizeTextField(p(c, "did")) : "";
  if (!canManageClients(c)) return die("Not allowed.");
  const to = postInt(c, "assign_to");
  if (to) {
    await dispatchStatusSet(c, did, { assigned_to: to });
    const admin = await loadUser(c.env, to);
    if (admin && isEmail(admin.user_email)) {
      await sendMail(c.env, admin.user_email, "A dispatch was assigned to you", "<p>" + esc(c.user?.display_name ?? "") + " assigned you a customer dispatch. Open your account page to view it.</p>", ["Content-Type: text/html; charset=UTF-8"]);
    }
  }
  return dispatchRedirect(c, to ? "assigned" : "err");
}
/** gff_dispatch_forward: the request's details emailed to a team member. */
export async function dispatchForward(c: AdminCtx): Promise<Reply> {
  const did = has(c, "did") ? sanitizeTextField(p(c, "did")) : "";
  if (!canManageClients(c)) return die("Not allowed.");
  const to = postInt(c, "forward_to");
  let ok = false;
  if (to) {
    const admin = await loadUser(c.env, to);
    const match = (await collectDispatches(c, 60, 400)).find((d) => d.id === did) ?? null;
    if (admin && isEmail(admin.user_email) && match) {
      let body = "<p>" + esc(c.user?.display_name ?? "") + " forwarded you a customer dispatch:</p>";
      body += "<p><strong>" + esc(match.name) + "</strong> - " + esc(match.type_label) + "<br>";
      body += "Email: " + esc(match.email) + (truthy(match.phone) ? "<br>Phone: " + esc(str(match.phone)) : "") + "</p>";
      body += "<hr><p>" + esc(match.summary) + "</p>";
      const headers = ["Content-Type: text/html; charset=UTF-8"];
      if (isEmail(match.email)) headers.push("Reply-To: " + match.name + " <" + match.email + ">");
      ok = await sendMail(c.env, admin.user_email, "Forwarded dispatch: " + match.name, body, headers);
    }
  }
  return dispatchRedirect(c, ok ? "forwarded" : "err");
}

const clientRedirect = (c: AdminCtx, note: string) => new RedirectReply(addQueryArg({ gff_cnote: note }, back(c)));
/** gff_client_toggle_active. */
export async function clientToggleActive(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  await setMeta(c, uid, "gff_active", (await clientIsActive(c, uid)) ? "no" : "yes");
  return clientRedirect(c, "saved");
}
/** gff_client_save_notes. */
export async function clientSaveNotes(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  await setMeta(c, uid, "gff_notes", has(c, "gff_notes") ? sanitizeTextareaField(p(c, "gff_notes")) : "");
  return clientRedirect(c, "saved");
}
/** gff_lead_make_customer. */
export async function leadMakeCustomer(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  const u = await loadUser(c.env, uid);
  if (u && u.roles.includes("gff_lead")) {
    await removeRole(c, u, "gff_lead");
    await addRole(c, u, "gff_customer");
    await setMeta(c, uid, "gff_active", "yes");
    await setMeta(c, uid, "gff_converted_at", currentMysql(c));
  }
  return clientRedirect(c, "converted");
}
/** gff_client_delete: admins only; never an admin or oneself, only customers and leads. */
export async function clientDelete(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!can(c, "delete_users")) return die("Not allowed.");
  const u = await loadUser(c.env, uid);
  const roles = u ? u.roles : [];
  const ok = !!u && uid !== c.uid && !roles.includes("administrator") && (roles.includes("gff_customer") || roles.includes("gff_lead"));
  if (ok) await deleteUser(c, uid);
  return clientRedirect(c, ok ? "deleted" : "err");
}
/** gff_client_setclass: lead / seed / customer (with a plan), and the matching role. */
export async function clientSetClass(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  const to = has(c, "klass") ? sanitizeKey(p(c, "klass")) : "";
  const plan = has(c, "plan") ? sanitizeKey(p(c, "plan")) : "";
  const u = await loadUser(c.env, uid);
  if (u && ["lead", "seed", "customer"].includes(to)) {
    await setMeta(c, uid, "gff_class", to);
    await setMeta(c, uid, "gff_paid", to === "customer" ? "yes" : "no");
    if (to === "customer" && ["sunrise", "spire", "both"].includes(plan)) {
      await setMeta(c, uid, "gff_paid_plan", plan);
      await setMeta(c, uid, "gff_offer", plan === "spire" ? "spire" : "sunrise");
    }
    if (to === "lead") {
      if (!u.roles.includes("gff_lead")) await addRole(c, u, "gff_lead");
      await removeRole(c, u, "gff_customer");
    } else {
      if (!u.roles.includes("gff_customer")) await addRole(c, u, "gff_customer");
      await removeRole(c, u, "gff_lead");
    }
    return clientRedirect(c, "classed");
  }
  return clientRedirect(c, "err");
}

/** gff_garden_send_email(). The subject's \xF0\x9F\x8C\xB1 sits in single quotes in the plugin, so it is sent as those 16 characters, not as 🌱. */
async function gardenSendEmail(c: Ctx, to: string, name: string, link: string): Promise<boolean> {
  let body = "<p>Hi " + esc(name) + ",</p>";
  body += "<p>It&rsquo;s time to choose what grows in your <strong>Zora custom garden</strong>. Tap below to pick the plants for your seasonal bed&rsquo;s 20 spots &mdash; we&rsquo;ll plant exactly what you choose on our next visit.</p>";
  body += '<p><a href="' + escUrl(link) + '" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;font-weight:600;">&#127793; Choose my garden plants</a></p>';
  body += '<p style="font-size:13px;color:#666;">Or paste this link into your browser:<br>' + esc(link) + "</p>";
  body += "<p>&mdash; Gawlak Family Farms</p>";
  const headers = ["Content-Type: text/html; charset=UTF-8"];
  const owner = str(opt(c, "gff_reg_msg_recipient", "martingawlak@gmail.com"));
  if (isEmail(owner)) headers.push("Reply-To: Gawlak Family Farms <" + owner + ">");
  return sendMail(c.env, to, "Design your Zora custom garden \\xF0\\x9F\\x8C\\xB1", body, headers);
}
/** gff_send_garden_invite: a 30-day no-login link to pick garden plants (the token stored hashed). */
export async function sendGardenInvite(c: AdminCtx): Promise<Reply> {
  const uid = postInt(c, "uid");
  if (!canManageClients(c)) return die("Not allowed.");
  const user = await loadUser(c.env, uid);
  let ok = false;
  if (user && isEmail(user.user_email)) {
    const tok = randomCode(24);
    await setMeta(c, uid, "gff_garden_token", wpHash(c, tok));
    await setMeta(c, uid, "gff_garden_token_exp", String(c.now + 30 * DAY));
    const base = str(opt(c, "gff_garden_url", homeUrl(c, "/garden/")));
    const link = addQueryArg({ g: uid, t: tok }, base);
    let name = ((await ms(c, uid, "first_name")) + " " + (await ms(c, uid, "last_name"))).trim();
    if (name === "") name = user.display_name;
    ok = await gardenSendEmail(c, user.user_email, name, link);
  }
  return clientRedirect(c, ok ? "invited" : "err");
}

/* ---- The user-profile saves, in hook order ---- */
/** personal_options_update / edit_user_profile_update for the plugin's panels. */
export async function profileSave(c: AdminCtx, uid: number): Promise<void> {
  // Priority 5: the invoice fields.
  if (can(c, "edit_users") && (has(c, "gff_inv_amount") || has(c, "gff_inv_overview"))) {
    const amount = p(c, "gff_inv_amount").replace(/[^0-9.]/g, "");
    await setMeta(c, uid, "gff_inv_amount", amount === "" ? "" : nf2(phpFloat(amount)));
    await setMeta(c, uid, "gff_inv_overview", sanitizeTextareaField(p(c, "gff_inv_overview")));
    await setMeta(c, uid, "gff_inv_spire_rate", p(c, "gff_inv_spire_rate").replace(/[^0-9.]/g, ""));
    await setMeta(c, uid, "gff_inv_sqft_rate", p(c, "gff_inv_sqft_rate").replace(/[^0-9.]/g, ""));
  }
  // The add-ons.
  if (can(c, "edit_users")) {
    const cat = addons();
    const picked: string[] = [];
    const list = pa(c, "gff_addons");
    if (list && list.length) for (const k0 of list) { const k = sanitizeKey(k0); if (cat[k]) picked.push(k); }
    await setMeta(c, uid, "gff_addons", [...new Set(picked)]);
    await setMeta(c, uid, "gff_addons_notes", has(c, "gff_addons_notes") ? sanitizeTextareaField(p(c, "gff_addons_notes")) : "");
  }
  // The account inputs (only when that panel was submitted).
  if (can(c, "edit_users") && (has(c, "gff_offer") || has(c, "gff_reservation"))) {
    let offer = sanitizeKey(p(c, "gff_offer"));
    if (!["", "sunrise", "spire"].includes(offer)) offer = "";
    await setMeta(c, uid, "gff_offer", offer);
    for (const k of ["gff_phone", "gff_service_address", "gff_service_city", "gff_service_zip", "gff_start_sqft", "gff_start_date"]) await setMeta(c, uid, k, sanitizeTextField(p(c, k)));
    let qty = postInt(c, "gff_tower_qty");
    if (qty < 0) qty = 0;
    await setMeta(c, uid, "gff_tower_qty", String(qty));
    let reservation = sanitizeKey(has(c, "gff_reservation") ? p(c, "gff_reservation") : "none");
    if (!["none", "consult", "down_payment", "workshop"].includes(reservation)) reservation = "none";
    await setMeta(c, uid, "gff_reservation", reservation);
    await setMeta(c, uid, "gff_reservation_amount", money(has(c, "gff_reservation_amount") ? p(c, "gff_reservation_amount") : "0.00"));
    await setMeta(c, uid, "gff_reservation_paid", has(c, "gff_reservation_paid") ? "yes" : "no");
    await setMeta(c, uid, "gff_rate_lock", has(c, "gff_rate_lock") ? "yes" : "no");
    await setMeta(c, uid, "gff_workshop_interest", has(c, "gff_workshop_interest") ? "yes" : "no");
    await setMeta(c, uid, "gff_spire_unlocked", has(c, "gff_spire_unlocked") ? "yes" : "no");
  }
  // Send Invoice.
  if (can(c, "edit_users") && truthy(c.post.gff_send_invoice) && has(c, "gff_invoice_nonce")) {
    const user = await loadUser(c.env, uid);
    if (user && isEmail(user.user_email)) {
      await sendInvoice(c, user, money(await ms(c, uid, "gff_inv_amount")), await ms(c, uid, "gff_inv_overview"));
    }
  }
  // The contact phone.
  if (can(c, "edit_user", uid) && has(c, "gff_phone")) await setMeta(c, uid, "gff_phone", sanitizeTextField(p(c, "gff_phone")));
  // Service & billing (v3.33).
  if (can(c, "edit_users")) await v33HandleProfile(c, uid);
}

/** gff_v33_handle_profile(): the consult credit, Start Service, Stop billing. */
async function v33HandleProfile(c: AdminCtx, uid: number): Promise<void> {
  if (has(c, "gff_v33_start_nonce") || has(c, "gff_v33_stop_nonce")) await setMeta(c, uid, "gff_consult_paid", has(c, "gff_consult_paid") ? "yes" : "no");
  if (truthy(c.post.gff_v33_start)) {
    if (!has(c, "gff_v33_start_nonce")) return;
    if ((await meta(c, uid, "gff_service_active")) === "yes") return;
    const balance = await v33BuildBalance(c, uid);
    let overview = "Design, build, and install — soil, plants, structure, installation. Includes your first month of service, complimentary herbs, enrollment in the Propagation Program, and one apparel item.";
    if (balance < v33StartTotal()) overview += " Your $" + nf2(v33Consult()) + " design consult has been credited in full.";
    if (!(await v33SendInvoice(c, await loadUser(c.env, uid), balance, overview))) return;
    await setMeta(c, uid, "gff_service_active", "yes");
    await setMeta(c, uid, "gff_service_started", currentMysql(c));
    await setMeta(c, uid, "gff_invoice_cycles", "1");
    await setMeta(c, uid, "gff_next_invoice_ts", String(currentTs(c) + v33CycleDays() * DAY));
    await setMeta(c, uid, "gff_propagation_due", String(currentTs(c) + YEAR));
  }
  if (truthy(c.post.gff_v33_stop)) {
    if (!has(c, "gff_v33_stop_nonce")) return;
    await setMeta(c, uid, "gff_service_active", "no");
    await deleteMeta(c, uid, "gff_next_invoice_ts");
  }
}

/** gff_v33_run_cycle(): the daily sweep — invoice everyone whose next invoice is due; advance the clock only on a sent invoice. */
export async function v33RunCycle(c: Ctx): Promise<void> {
  const users = await getUsers(c, { meta_key: "gff_service_active", meta_value: "yes", number: 200 });
  if (!users.length) return;
  const now = currentTs(c);
  for (const u of users) {
    const due = phpInt(await meta(c, u.ID, "gff_next_invoice_ts"));
    if (!due || due > now) continue;
    const sent = await v33SendInvoice(c, u, v33Monthly(), "Monthly service — weekly visits, planting, maintenance, seasonal replanting.");
    if (sent) {
      await setMeta(c, u.ID, "gff_next_invoice_ts", String(now + v33CycleDays() * DAY));
      await setMeta(c, u.ID, "gff_invoice_cycles", String(phpInt(await meta(c, u.ID, "gff_invoice_cycles")) + 1));
    }
  }
}

/**
 * WordPress's options.php for the GFF Settings form: each of the plugin's
 * registered settings takes the posted value (trimmed), or nothing, through
 * its sanitize callback; then back to the form with settings-updated=true.
 */
export async function saveSettings(c: AdminCtx): Promise<Reply> {
  if (!can(c, "manage_options")) return die("Sorry, you are not allowed to manage options for this site.");
  const group = has(c, "option_page") ? p(c, "option_page") : "gff_reg_settings_group";
  if (group === "gff_dbk_group") await saveDbkSettings(c);
  for (const [name, cb] of group === "gff_reg_settings_group" ? SETTINGS : []) {
    const v = has(c, name) ? p(c, name).trim() : null;
    const clean = cb === "esc_url_raw" ? escUrlRaw(v ?? "") : cb === "sanitize_email" ? sanitizeEmail(v ?? "") : sanitizeTextareaField(v ?? "");
    await setOpt(c, name, clean);
  }
  return new RedirectReply(addQueryArg({ "settings-updated": "true" }, getReferer(c, "/wp-admin/options.php") || "/wp-admin/options.php"));
}
