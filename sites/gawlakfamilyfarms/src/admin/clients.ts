/**
 * Clients and invoices (gff-customer-registration.php §12–12b, 15–17, 33):
 * the client list, tiers and plans, the per-customer invoice log, invoice
 * numbering, the invoice email with its payment methods, and the one shared
 * invoice sender. Ported line for line; checked by test/actions.parity.ts.
 */
import { type Ctx, loginUrl, meta, opt, setMeta, setOpt, type User } from "../ctx";
import { esc, escUrl, gmdate, numberFormat, phpFloat, phpInt, rawurlencode } from "../php";
import { isEmail } from "../wpfn";
import { sendMail } from "../wp";
import { currentMysql } from "../wpcore";
import { paypalLink } from "../forms/catalog";
import { isArr, str } from "../forms/express";
import { getUsers, registeredOf } from "./core";

/** number_format( $n, 2, '.', '' ). */
export const nf2 = (n: number) => numberFormat(n, 2).replace(/,/g, "");
/** nl2br(): "<br />" before every line break, keeping the break. */
export const nl2br = (s: string) => s.replace(/(\r\n|\n\r|\n|\r)/g, "<br />$1");
/** A meta value exactly as stored: for the JSON text the plugin keeps in meta (meta() decodes JSON). */
export async function rawMeta(c: Ctx, uid: number, key: string): Promise<string> {
  const r = await c.env.DB.prepare("select meta_value from wp_usermeta where user_id = ? and meta_key = ?").bind(uid, key).first<{ meta_value: string | null }>();
  return r?.meta_value ?? "";
}
/** (string) get_user_meta( $uid, $key, true ). */
export const ms = async (c: Ctx, uid: number, key: string) => str(await meta(c, uid, key));

export interface ClientRow {
  id: number; role: string; name: string; email: string; phone: string; address: string; city: string; zip: string; sqft: string; start_date: string;
  ratelock: string; reservation: string; reservation_paid: string; reservation_txn: string; reservation_paid_at: string; reservation_credited: string;
  addons: string; addons_total: string; addons_invoiced: string; lead_city: string; crops: string[]; farm_layout: string; moringa_upgrade: string;
  workshop: string; agr_ver: string; agr_when: string; agr_ip: string; joined: string;
}

/** gff_reg_collect_clients(): every customer and lead, newest first. */
export async function collectClients(c: Ctx): Promise<ClientRow[]> {
  const users = await getUsers(c, { role__in: ["gff_customer", "gff_lead"], orderby: "registered", order: "DESC" });
  const rows: ClientRow[] = [];
  for (const u of users) {
    const crops0 = await meta(c, u.ID, "gff_crops_wanted");
    const crops = Array.isArray(crops0) ? crops0.map((x) => str(x)) : isArr(crops0) ? Object.values(crops0).map((x) => str(x)) : [];
    const m = (k: string) => ms(c, u.ID, k);
    rows.push({
      id: u.ID,
      role: u.roles.includes("gff_customer") ? "Customer" : "Lead",
      name: ((await m("first_name")) + " " + (await m("last_name"))).trim(),
      email: u.user_email,
      phone: await m("gff_phone"), address: await m("gff_service_address"), city: await m("gff_service_city"), zip: await m("gff_service_zip"),
      sqft: await m("gff_start_sqft"), start_date: await m("gff_start_date"), ratelock: await m("gff_rate_lock"),
      reservation: await m("gff_reservation"), reservation_paid: await m("gff_reservation_paid"), reservation_txn: await m("gff_reservation_txn"),
      reservation_paid_at: await m("gff_reservation_paid_at"), reservation_credited: await m("gff_reservation_credited_signup"),
      addons: await m("gff_addons_labels"), addons_total: await m("gff_addons_total"), addons_invoiced: await m("gff_addons_invoiced"),
      lead_city: await m("gff_lead_city"), crops,
      // The plugin stores the layout as JSON text: read it as stored (meta() would hand back the decoded array).
      farm_layout: await rawMeta(c, u.ID, "gff_farm_layout"), moringa_upgrade: await m("gff_moringa_fruit_upgrade"),
      workshop: await m("gff_workshop_interest"), agr_ver: await m("gff_agreement_version"), agr_when: await m("gff_agreement_accepted_at"),
      agr_ip: await m("gff_agreement_ip"), joined: await registeredOf(c, u.ID),
    });
  }
  return rows;
}

/** gff_class_of(): lead | seed | customer, stored or derived. */
export async function classOf(c: Ctx, id: number): Promise<string> {
  const cl = await meta(c, id, "gff_class");
  if (cl === "lead" || cl === "seed" || cl === "customer") return cl;
  const addr = (await ms(c, id, "gff_service_address")).trim();
  const paid = (await meta(c, id, "gff_paid")) === "yes" || (await meta(c, id, "gff_reservation_paid")) === "yes";
  if (addr === "") return "lead";
  return paid ? "customer" : "seed";
}
export const classLabel = (cl: string) => ({ lead: "Lead", seed: "Free Seeds", customer: "Paid Client" } as Record<string, string>)[cl] ?? "Lead";
/** gff_paid_plan_of(): sunrise | spire | both. */
export async function paidPlanOf(c: Ctx, id: number): Promise<string> {
  const p = await meta(c, id, "gff_paid_plan");
  if (p === "sunrise" || p === "spire" || p === "both") return p;
  const offer = await meta(c, id, "gff_offer");
  const tower = phpInt(await meta(c, id, "gff_tower_qty")) > 0;
  if (offer === "sunrise" && tower) return "both";
  if (offer === "spire") return "spire";
  return "sunrise";
}
export const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** gff_client_is_active(). */
export const clientIsActive = async (c: Ctx, id: number) => (await meta(c, id, "gff_active")) !== "no";

/* ---- Invoice log ---- */
export type InvEntry = Record<string, any>;
export async function invLogGet(c: Ctx, uid: number): Promise<InvEntry[]> {
  const l = await meta(c, uid, "gff_inv_log");
  return Array.isArray(l) ? l : isArr(l) ? Object.values(l) : [];
}
export async function invLogAdd(c: Ctx, uid: number, number: string, amount: string, overview: string): Promise<void> {
  const log = await invLogGet(c, uid);
  log.push({ num: number, amount: nf2(phpFloat(amount)), overview, sent_at: currentMysql(c), status: "sent", paid_at: "", paid_by: 0 });
  await setMeta(c, uid, "gff_inv_log", log);
}
export const invOpenEntries = async (c: Ctx, uid: number) => (await invLogGet(c, uid)).filter((e) => !e?.status || e.status !== "paid");
export async function invOutstandingTotal(c: Ctx, uid: number): Promise<number> {
  let t = 0;
  for (const e of await invOpenEntries(c, uid)) t += phpFloat(e.amount);
  return t;
}
/** gff_inv_mark(): flip one invoice (by number) paid/unpaid. */
export async function invMark(c: Ctx, uid: number, num: string, paid: boolean, by: number): Promise<boolean> {
  const log = await invLogGet(c, uid);
  let hit = false;
  for (const e of log) {
    if (str(e.num) === num) {
      e.status = paid ? "paid" : "sent";
      e.paid_at = paid ? currentMysql(c) : "";
      e.paid_by = paid ? by : 0;
      hit = true;
    }
  }
  if (hit) await setMeta(c, uid, "gff_inv_log", log);
  return hit;
}

/* ---- Numbering ---- */
/** gff_reg_next_invoice_number(): 213 for the first, then +1; GFF-000214-U18-20261120. */
export async function nextInvoiceNumber(c: Ctx, uid: number): Promise<string> {
  const cur = phpInt(opt(c, "gff_invoice_counter", 0));
  const next = cur < 213 ? 213 : cur + 1;
  await setOpt(c, "gff_invoice_counter", String(next));
  return "GFF-" + String(next).padStart(6, "0") + "-U" + uid + "-" + gmdate("Ymd", c.now);
}
/** gff_reg_rollback_invoice_number(): a failed send gives its number back. */
export async function rollbackInvoiceNumber(c: Ctx): Promise<void> {
  const cur = phpInt(opt(c, "gff_invoice_counter", 0));
  if (cur > 213) await setOpt(c, "gff_invoice_counter", String(cur - 1));
  else if (cur === 213) await setOpt(c, "gff_invoice_counter", "212");
}

/* ---- Payment methods ---- */
export const payMethods = (): Record<string, { label: string; option: string; kind: string; hint: string }> => ({
  paypal: { label: "PayPal", option: "gff_pay_paypal_me", kind: "link", hint: "Your PayPal.me handle, e.g. paypal.me/yourname (an amount is appended automatically). Leave blank to fall back to your fixed PayPal link." },
  cashapp: { label: "Cash App", option: "gff_pay_cashapp", kind: "link", hint: "Your $cashtag, e.g. $YourTag (without the URL)." },
  venmo: { label: "Venmo", option: "gff_pay_venmo", kind: "link", hint: "Your Venmo username (without the @)." },
  zelle: { label: "Zelle", option: "gff_pay_zelle", kind: "detail", hint: "The email or phone enrolled with Zelle. Customer sends from their own bank app — no link is possible." },
  ach: { label: "Bank transfer (ACH / wire)", option: "gff_pay_ach", kind: "detail", hint: "Bank name, routing number, and account number. Customer enters these in their bank — no link is possible." },
  chime: { label: "Chime", option: "gff_pay_chime", kind: "detail", hint: "Your $ChimeSign. Customer pays from the Chime app — no link is possible." },
});
const optStr = (c: Ctx, k: string) => str(opt(c, k, ""));
/** gff_reg_pay_link_url(): a tappable, amount-prefilled link; '' when the method is not set. */
export function payLinkUrl(c: Ctx, key: string, amount: string): string {
  const amt = nf2(phpFloat(amount));
  switch (key) {
    case "paypal": {
      let me = optStr(c, "gff_pay_paypal_me").trim();
      if (me !== "") {
        me = me.replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.me\//i, "").replace(/^\/+|\/+$/g, "");
        return "https://www.paypal.com/paypalme/" + rawurlencode(me) + "/" + amt;
      }
      const fixed = paypalLink(c);
      return fixed ? fixed : "";
    }
    case "cashapp": {
      const tag = optStr(c, "gff_pay_cashapp").trim();
      if (tag === "") return "";
      return "https://cash.app/$" + rawurlencode(tag.replace(/^\$+/, "")) + "/" + amt;
    }
    case "venmo": {
      const u = optStr(c, "gff_pay_venmo").trim();
      if (u === "") return "";
      return "https://venmo.com/?txn=pay&recipients=" + rawurlencode(u.replace(/^@+/, "")) + "&amount=" + rawurlencode(amt);
    }
    default: return "";
  }
}

/** gff_reg_business_info(). */
export const businessInfo = () => ({
  name: "Gawlak Family Farms", legal: "Martin Gawlak Company LLC", address: "4609 Magnolia Drive, Fort Pierce, Florida 34982",
  email: "martingawlak@gmail.com", phone: "772-924-7459",
});

/** gff_reg_build_invoice_email(). */
export async function buildInvoiceEmail(c: Ctx, user: User, amount: string, overview: string, invoiceNumber = ""): Promise<string> {
  const name = (await ms(c, user.ID, "first_name")).trim();
  const hello = name ? esc(name) : "there";
  const biz = businessInfo();
  if (invoiceNumber === "") invoiceNumber = "GFF #" + user.ID;
  const memo = invoiceNumber;
  const invDate = gmdate("F j, Y", c.now);
  const login = loginUrl();
  const row = (inner: string) => '<tr><td style="padding:10px 0;border-bottom:1px solid #e7e2d6;">' + inner + "</td></tr>";
  let blocks = "";
  for (const [key, m] of Object.entries(payMethods())) {
    if (m.kind === "link") {
      const url = payLinkUrl(c, key, amount);
      if (url === "") continue;
      blocks += row('<strong style="color:#1c1c1a;">' + esc(m.label) + "</strong> &mdash; pre-filled to $" + esc(amount) + "<br>"
        + '<a href="' + escUrl(url) + '" style="display:inline-block;margin-top:6px;background:#1c1c1a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:bold;">Pay $' + esc(amount) + " with " + esc(m.label) + "</a>");
    } else {
      const detail = optStr(c, m.option).trim();
      if (detail === "") continue;
      blocks += row('<strong style="color:#1c1c1a;">' + esc(m.label) + "</strong> &mdash; send $" + esc(amount) + "<br>"
        + '<div style="margin-top:4px;font-size:14px;color:#333;background:#f6f4ec;padding:8px 12px;border-radius:6px;">' + nl2br(esc(detail)) + "</div>"
        + '<div style="font-size:13px;color:#555;margin-top:4px;">Amount: <strong>$' + esc(amount) + "</strong> &middot; Please put <strong>" + esc(memo) + "</strong> in the memo/note.</div>");
    }
  }
  blocks += row('<strong style="color:#1c1c1a;">In-person</strong> &mdash; pay $' + esc(amount) + " by cash or check<br>"
    + '<div style="margin-top:4px;font-size:14px;color:#333;background:#f6f4ec;padding:8px 12px;border-radius:6px;">'
    + "Cash or check, in person. Make checks payable to <strong>" + esc(biz.legal) + "</strong>."
    + "</div>"
    + '<div style="font-size:13px;color:#555;margin-top:4px;">Amount: <strong>$' + esc(amount) + "</strong> &middot; Reference: <strong>" + esc(memo) + "</strong>.</div>");
  const barterHref = "mailto:" + rawurlencode(biz.email) + "?subject=" + rawurlencode("Barter/Trade Offer for Gawlak Family Farms");
  blocks += row('<strong style="color:#1c1c1a;">Barter / Trade</strong> &mdash; propose a trade instead<br>'
    + '<a href="' + escUrl(barterHref) + '" style="display:inline-block;margin-top:6px;background:#7a4f00;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:bold;">Send a Barter/Trade Offer</a>'
    + '<div style="font-size:12px;color:#888;margin-top:4px;">Opens an email to us &mdash; tell us what you&rsquo;d like to trade and we&rsquo;ll reply.</div>');
  const overviewHtml = overview.trim() !== "" ? '<p style="margin:0 0 4px;"><strong>What this covers:</strong></p><div style="font-size:15px;color:#333;margin-bottom:18px;">' + nl2br(esc(overview)) + "</div>" : "";
  let out = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">';
  out += '<div style="border-bottom:2px solid #1c1c1a;padding-bottom:12px;margin-bottom:16px;">';
  out += '<h2 style="color:#1c1c1a;margin:0 0 4px;">' + esc(biz.name) + "</h2>";
  out += '<div style="font-size:12px;color:#555;line-height:1.5;">' + esc(biz.address) + "<br>" + esc(biz.email) + " &middot; " + esc(biz.phone) + "</div>";
  out += "</div>";
  out += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;font-size:13px;color:#333;">'
    + '<tr><td style="padding:2px 0;"><strong>Invoice #:</strong> ' + esc(invoiceNumber) + "</td></tr>"
    + '<tr><td style="padding:2px 0;"><strong>Date:</strong> ' + esc(invDate) + "</td></tr>"
    + '<tr><td style="padding:2px 0;"><strong>Due:</strong> Due on receipt</td></tr>'
    + '<tr><td style="padding:2px 0;"><strong>Billed to:</strong> ' + esc(hello !== "there" ? hello : user.user_email) + "</td></tr>"
    + "</table>";
  out += '<p style="font-size:15px;margin:0 0 16px;">Hi ' + hello + ", here is your invoice.</p>";
  out += '<div style="font-size:22px;font-weight:bold;color:#1c1c1a;margin:0 0 16px;">Amount due: $' + esc(amount) + "</div>";
  out += overviewHtml;
  out += '<p style="margin:0 0 6px;font-weight:bold;">Choose how to pay:</p>';
  out += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + blocks + "</table>";
  out += '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e7e2d6;">'
    + '<p style="font-size:14px;color:#444;margin:0;">Not the one paying? Just <strong>forward this email</strong> to whoever is &mdash; all the payment options above come along with it.</p>'
    + "</div>";
  out += '<div style="margin-top:14px;">'
    + '<p style="font-size:14px;color:#444;margin:0;">Want to add more to your garden? '
    + '<a href="' + escUrl(login) + '" style="color:#1c1c1a;font-weight:bold;">Log in to your account</a> to browse what else we offer.'
    + '<br><span style="font-size:12px;color:#888;">First time logging in? Use &ldquo;Lost your password?&rdquo; on that page to set one.</span></p>'
    + "</div>";
  out += '<div style="margin-top:14px;">'
    + '<p style="font-size:13px;color:#666;margin:0;"><strong>Save this invoice as a PDF for your records:</strong> in your email app, choose <em>Print</em>, then select <em>Save as PDF</em>.</p>'
    + "</div>";
  out += '<p style="font-size:13px;color:#555;margin-top:18px;">Reference for payment: <strong>' + esc(memo) + "</strong>. Questions? Just reply to this email.</p>";
  out += '<p style="font-size:18px;color:#1c1c1a;font-weight:bold;margin-top:22px;">Thank You.</p>';
  out += '<p style="font-size:10px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:10px;">' + esc(biz.legal) + "</p>";
  out += "</div>";
  return out;
}

/**
 * The one invoice send the plugin repeats in three places (profile, list
 * row, the v33 engine): number, email, and on success the log; a failed send
 * gives its number back. Returns the number on success, '' on failure.
 */
export async function sendInvoice(c: Ctx, user: User, amount: string, overview: string): Promise<string> {
  const invoiceNumber = await nextInvoiceNumber(c, user.ID);
  const body = await buildInvoiceEmail(c, user, amount, overview, invoiceNumber);
  const sent = await sendMail(c.env, user.user_email, "Your Gawlak Family Farms invoice — $" + amount, body, ["Content-Type: text/html; charset=UTF-8"]);
  if (sent) {
    await setMeta(c, user.ID, "gff_inv_number", invoiceNumber);
    await setMeta(c, user.ID, "gff_inv_last_sent", currentMysql(c) + " — $" + amount + " — " + invoiceNumber);
    await invLogAdd(c, user.ID, invoiceNumber, amount, overview);
    return invoiceNumber;
  }
  await rollbackInvoiceNumber(c);
  return "";
}

/** gff_v33_send_invoice(): the engine's sender (a valid email required). */
export async function v33SendInvoice(c: Ctx, user: User | null, amount: number, overview: string): Promise<boolean> {
  if (!user || !isEmail(user.user_email)) return false;
  return (await sendInvoice(c, user, nf2(amount), overview)) !== "";
}

/* ---- v3.33 pricing ---- */
export const v33Monthly = () => 300.0;
export const v33Consult = () => 250.0;
export const v33StartTotal = () => 772.0;
export const v33CycleDays = () => 30;
export async function v33BuildBalance(c: Ctx, uid: number): Promise<number> {
  const credit = (await meta(c, uid, "gff_consult_paid")) === "yes" ? v33Consult() : 0;
  const bal = v33StartTotal() - credit;
  return bal > 0 ? bal : 0;
}
