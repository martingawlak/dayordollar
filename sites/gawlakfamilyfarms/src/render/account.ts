/**
 * The account page: [gff_account] (the guest view, or the customer's details,
 * farm, planner and message form; administrators and staff get the dispatch
 * dashboard instead), [gff_my_farm], [gff_account_planner] and the
 * [gff_farm_builder] they embed. Each handles its own POST to the page
 * (message, Spire unlock / request, Three Sisters, planner save) before it
 * renders, as the plugin did. Ported line for line; the long fixed blocks
 * come from the plugin itself (templates.gen.ts). Checked by
 * test/render.parity.ts.
 */
import type { Post } from "../ajax";
import { adminUrl, type Ctx, homeUrl, isAdmin, loggedIn, loginUrl, logoutUrl, meta, nonce, opt, setMeta } from "../ctx";
import { md5 } from "../md5";
import { esc, escUrl, phpInt, phpJson, truthy } from "../php";
import { isEmail, sanitizeKey, sanitizeTextareaField } from "../wpfn";
import { sendMail } from "../wp";
import { currentMysql, getUserBy } from "../wpcore";
import { addons, offers, paypalLink, towerAddlPrice, towerFirstPrice } from "../forms/catalog";
import { isArr, notEmpty, parseLayout, phpJsonDecode, sendThreeSistersEmail, str } from "../forms/express";
import { type Atts, fill, shortcodeAtts } from "./home";
import { ACCT_STYLES, FARM_BUILDER_T, MY_FARM_STYLE } from "./templates.gen";

/** The request's form fields ($_POST): the page posts to itself. */
export const postOf = (c: Ctx): Post => ((c as Ctx & { post?: Post }).post ?? {});
const pstr = (post: Post, k: string) => { const v = post[k]; return v === undefined ? "" : Array.isArray(v) ? "Array" : v; };

/** urlencode() */
const urlencode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()*~]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
/** urldecode() */
const urldecode = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
/** remove_query_arg( $key, $uri ): add_query_arg()'s rebuild with that argument dropped (existing values re-encoded, as WordPress does). */
export function removeQueryArg(uri: string, key: string): string {
  let frag = "";
  const h = uri.indexOf("#");
  if (h >= 0) { frag = uri.slice(h); uri = uri.slice(0, h); }
  let protocol = "";
  if (/^http:\/\//i.test(uri)) { protocol = "http://"; uri = uri.slice(7); } else if (/^https:\/\//i.test(uri)) { protocol = "https://"; uri = uri.slice(8); }
  let base: string, query: string;
  if (uri.includes("?")) { const i = uri.indexOf("?"); base = uri.slice(0, i) + "?"; query = uri.slice(i + 1); }
  else if (protocol || !uri.includes("=")) { base = uri + "?"; query = ""; }
  else { base = ""; query = uri; }
  const qs = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const i = pair.indexOf("=");
    const k = urldecode(i >= 0 ? pair.slice(0, i) : pair);
    if (k !== "") qs.set(k, urlencode(urldecode(i >= 0 ? pair.slice(i + 1) : "")));
  }
  qs.delete(key);
  let ret = [...qs].map(([k, v]) => k + "=" + v).join("&").replace(/^\?+|\?+$/g, "");
  ret = ret.replace(/=(&|$)/g, "$1");
  return (protocol + base + ret + frag).replace(/\?+$/, "");
}
/** The request's own path and query ($_SERVER['REQUEST_URI']): the page being rendered. */
export const requestUri = (c: Ctx) => { const r = (c as Ctx & { requestUri?: string }).requestUri; if (r !== undefined) return r; const u = new URL(c.permalink); return u.pathname + u.search; };
/** wp_referer_field( false ) */
export const refererField = (c: Ctx) => '<input type="hidden" name="_wp_http_referer" value="' + escUrl(removeQueryArg(requestUri(c), "_wp_http_referer")) + '" />';
/** wp_nonce_field( $action, $name ): the hidden nonce (the Worker checks the origin instead; see MIGRATION.md) and the referer, as WordPress prints them. */
export const nonceField = (c: Ctx, action: string, name: string) =>
  '<input type="hidden" id="' + esc(name) + '" name="' + esc(name) + '" value="' + nonce(action) + '" />' + refererField(c);
/** esc_js() */
export const escJs = (s: unknown) => esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n");
/** nl2br() */
export const nl2br = (s: string) => s.replace(/(\r\n|\n\r|\n|\r)/g, "<br />$1");
/** PHP trim()'s characters. */
const phpTrim = (s: string) => s.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");
/** mysql2date( $format, $date ): a stored site-time date, formatted as it reads. */
export function mysql2date(format: string, date: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str(date));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return format.replace(/M|j/g, (f) => (f === "M" ? months[d.getUTCMonth()] : String(d.getUTCDate())));
}

/** The per-plant colours the builder and the farm view share (read from the builder's own data). */
const COLORS: Record<string, string> = JSON.parse(/var PCOLOR = (\{[^\n]*\});/.exec(FARM_BUILDER_T)![1]);

/** The plugin's per-render random id (md5( uniqid() )), as a per-request counter: it only has to be unique on the page. */
const seqs = new WeakMap<Ctx, number>();
const uniqid = (c: Ctx) => { const n = (seqs.get(c) ?? 0) + 1; seqs.set(c, n); return "uniq-" + n; };

/**
 * json_decode( (string) get_user_meta( $uid, $key, true ), true ) for meta the
 * plugin stored as JSON text (gff_farm_layout): the Worker's meta() already
 * reads JSON-looking text back as a value.
 */
export async function metaJson(c: Ctx, uid: number, key: string): Promise<unknown> {
  const v = await meta(c, uid, key);
  return v !== null && typeof v === "object" ? v : phpJsonDecode(str(v));
}

/** gff_reg_customer_offer( $uid ): 'sunrise' | 'spire' | 'both' | ''. */
export async function customerOffer(c: Ctx, uid: number): Promise<string> {
  const offer = str(await meta(c, uid, "gff_offer"));
  if (offers().includes(offer)) return offer;
  if (phpInt(await meta(c, uid, "gff_tower_qty")) > 0) return "spire";
  const layout = await metaJson(c, uid, "gff_farm_layout");
  if (isArr(layout) && notEmpty(layout.offer) && offers().includes(layout.offer)) return layout.offer;
  if (["full", "express"].includes(str(await meta(c, uid, "gff_signup_flow")))) return "sunrise";
  return "";
}

/** gff_sunrise_spire_monthly( $qty ): 1st $100, 2nd and 3rd free, each more $50. */
export function sunriseSpireMonthly(qty: number): number {
  qty = Math.max(1, Math.trunc(qty));
  let total = towerFirstPrice();
  if (qty > 3) total += (qty - 3) * towerAddlPrice();
  return total;
}

/** The owner's address for customer notes (gff_reg_msg_recipient, else the default). */
function msgRecipient(c: Ctx): string {
  let to = str(opt(c, "gff_reg_msg_recipient", "martingawlak@gmail.com"));
  if (phpTrim(to) === "" || !isEmail(to)) to = "martingawlak@gmail.com";
  return to;
}
async function nameOf(c: Ctx, uid: number, display: string): Promise<string> {
  const name = phpTrim(str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name")));
  return name === "" ? display : name;
}

/** gff_reg_send_spire_request_email( $uid, $qty, $monthly ) */
export async function sendSpireRequestEmail(c: Ctx, uid: number, qty: number, monthly: number): Promise<boolean> {
  const user = await getUserBy(c, "id", uid);
  if (!user) return false;
  const phone = await meta(c, uid, "gff_phone");
  const name = await nameOf(c, uid, user.display_name);
  const subject = "Spire add-on request — " + name + " (Sunrise member)";
  let body = "<p><strong>" + esc(name) + "</strong> (Sunrise member) requested <strong>" + phpInt(qty) + " Spire" + (phpInt(qty) === 1 ? "" : "s") + "</strong> from their account page.</p>";
  body += "<p><strong>Sunrise-member pricing:</strong> $" + phpInt(monthly) + "/mo (1st $" + towerFirstPrice() + ", 2nd FREE — Sunrise exclusive, 3rd FREE, add&rsquo;l $" + towerAddlPrice() + "/mo).</p>";
  body += "<p><strong>Email:</strong> " + esc(user.user_email) + "<br>";
  if (truthy(phone)) body += "<strong>Phone:</strong> " + esc(phone) + "<br>";
  body += "<strong>User ID:</strong> " + phpInt(uid) + "</p>";
  body += "<p>Confirm scheduling with them, then set their Spire count + invoice from their profile (Users &rarr; Edit User).</p>";
  return sendMail(c.env, msgRecipient(c), subject, body, ["Content-Type: text/html; charset=UTF-8", "Reply-To: " + name + " <" + user.user_email + ">"]);
}

/** gff_reg_send_spire_unlock_email( $uid, $channel ) */
export async function sendSpireUnlockEmail(c: Ctx, uid: number, channel: string): Promise<boolean> {
  const user = await getUserBy(c, "id", uid);
  if (!user) return false;
  const phone = await meta(c, uid, "gff_phone");
  const name = await nameOf(c, uid, user.display_name);
  const subject = "Spire design unlock ($100) — " + name + (channel === "paypal" ? " clicked PayPal" : " wants an invoice");
  let body = "<p><strong>" + esc(name) + "</strong> (Sunrise member) started the <strong>$100 Spire-design unlock</strong> from their account page.</p>";
  body += channel === "paypal"
    ? "<p>They clicked the <strong>PayPal $100</strong> link &mdash; check the PayPal inbox for the payment, then tick <em>Spire design: Unlocked</em> on their profile (Users &rarr; Edit User).</p>"
    : "<p>They asked for an <strong>invoice</strong> &mdash; send the $100 invoice from their profile (Users &rarr; Edit User), and tick <em>Spire design: Unlocked</em> once it&rsquo;s paid.</p>";
  body += "<p><strong>Email:</strong> " + esc(user.user_email) + "<br>";
  if (truthy(phone)) body += "<strong>Phone:</strong> " + esc(phone) + "<br>";
  body += "<strong>User ID:</strong> " + phpInt(uid) + "</p>";
  return sendMail(c.env, msgRecipient(c), subject, body, ["Content-Type: text/html; charset=UTF-8", "Reply-To: " + name + " <" + user.user_email + ">"]);
}

/** gff_acct_send_message(): the customer's note to the owner (HTML, Reply-To the customer), logged on their profile. */
export async function acctSendMessage(c: Ctx, uid: number, email: string, name: string, phone: unknown, msg: string): Promise<boolean> {
  const subject = "New account message from " + name;
  let body = "<p><strong>" + esc(name) + "</strong> sent a message from their account page.</p>";
  body += "<p><strong>Email:</strong> " + esc(email) + "<br>";
  if (truthy(phone)) body += "<strong>Phone:</strong> " + esc(phone) + "<br>";
  body += "<strong>User ID:</strong> " + phpInt(uid) + "</p>";
  body += "<hr><p>" + nl2br(esc(msg)) + "</p>";
  const sent = await sendMail(c.env, msgRecipient(c), subject, body, ["Content-Type: text/html; charset=UTF-8", "Reply-To: " + name + " <" + email + ">"]);
  const l = await meta(c, uid, "gff_acct_messages");
  let log: any[] = Array.isArray(l) ? [...l] : isArr(l) ? Object.values(l) : [];
  log.unshift({ time: currentMysql(c), msg, sent: sent ? 1 : 0 });
  if (log.length > 50) log = log.slice(0, 50);
  await setMeta(c, uid, "gff_acct_messages", log);
  return sent;
}

/** gff_acct_styles() */
export const acctStyles = () => ACCT_STYLES;

/**
 * gff_admin_dashboard( 'full' | 'clients' ): the dispatch command center the
 * account page shows administrators and staff (ported with dispatch; set here
 * by that module).
 */
export const dashboard: { render: (c: Ctx, view: "full" | "clients") => Promise<string> } = {
  render: async () => { throw new Error("gff_admin_dashboard is not ported yet"); },
};
/** current_user_can( 'gff_view_clients' ): staff (and administrators). */
const canViewClients = (c: Ctx) => !!c.user && (c.user.roles.includes("gff_staff") || c.user.roles.includes("administrator"));

/**
 * The guest view's sign-in copy (intended difference 9, MIGRATION.md): the
 * plugin's "Log in with WordPress" button and its "Prefer Google? Use the
 * Google button on the login page" hint described WordPress's login; the
 * accounts sign-in offers an email code and Google itself.
 */
export const GUEST_BUTTON = "Sign in";
export const GUEST_HINT = "Sign in with a code sent to your email, or with Google.";

/** [gff_account] */
export async function account(c: Ctx, _atts: Atts = {}): Promise<string> {
  if (!loggedIn(c)) {
    const login = loginUrl(c.permalink);
    const home = homeUrl(c, "/");
    return `\t\t<div class="gff-acct gff-acct--guest">
\t\t\t<h2 class="gff-acct__title">Your Gawlak Family Farms account</h2>
\t\t\t<p class="gff-acct__lead">Log in to view your farm and send us a message.</p>
\t\t\t<p class="gff-acct__actions">
\t\t\t\t<a class="gff-acct__btn" href="${escUrl(login)}">${GUEST_BUTTON}</a>
\t\t\t</p>
\t\t\t` + '<p class="gff-acct__hint">' + GUEST_HINT + "</p>"
      + `\t\t\t<p class="gff-acct__hint">New here? <a href="${escUrl(home)}">Create an account on our home page</a>.</p>
\t\t</div>
\t\t` + acctStyles() + "\t\t";
  }
  if (isAdmin(c)) return dashboard.render(c, "full");
  if (canViewClients(c)) return dashboard.render(c, "clients");

  const uid = c.uid;
  const user = c.user!;
  const phone = await meta(c, uid, "gff_phone");
  const name = await nameOf(c, uid, user.display_name);

  const post = postOf(c);
  let notice = "";
  if (post.gff_acct_msg_nonce !== undefined) {
    const msg = post.gff_acct_message !== undefined ? sanitizeTextareaField(pstr(post, "gff_acct_message")) : "";
    if (phpTrim(msg) === "") {
      notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please type a message before sending.</div>';
    } else {
      const sent = await acctSendMessage(c, uid, user.user_email, name, phone, msg);
      notice = sent
        ? '<div class="gff-acct__notice gff-acct__notice--ok">Message sent — we&rsquo;ll get back to you soon.</div>'
        : '<div class="gff-acct__notice gff-acct__notice--warn">Sorry, the message could not be sent. Please call us at (772) 924-7459.</div>';
    }
  }

  let o = `\t<div class="gff-acct">
\t\t<h2 class="gff-acct__title">Your account</h2>
\t\t${notice}
\t\t<div class="gff-acct__card">
\t\t\t<h3 class="gff-acct__h3">Your details</h3>
\t\t\t<ul class="gff-acct__details">
\t\t\t\t<li><span>Name</span><strong>${esc(name)}</strong></li>
\t\t\t\t<li><span>Email</span><strong>${esc(user.user_email)}</strong></li>
\t\t\t\t`;
  if (truthy(phone)) o += "<li><span>Phone</span><strong>" + esc(phone) + "</strong></li>";
  o += `\t\t\t</ul>
\t\t\t<p class="gff-acct__manage">
\t\t\t\t\t\t\t\t\t<a href="${escUrl(homeUrl(c, "/account/"))}">Manage password &amp; account details</a>
\t\t\t\t\t\t\t</p>
\t\t</div>

\t\t<div class="gff-acct__card">
\t\t\t`;
  o += await myFarm(c);
  o += "\t\t</div>\n\n\t\t\t\t";
  const planner = await accountPlanner(c);
  if (phpTrim(planner) !== "") o += "\t\t\t<div class=\"gff-acct__card\">\n\t\t\t\t" + planner + "\t\t\t</div>\n\t\t";
  o += `
\t\t<div class="gff-acct__card">
\t\t\t<h3 class="gff-acct__h3">Send us a message</h3>
\t\t\t<p class="gff-acct__sub">Questions, changes, or scheduling — send it here and we&rsquo;ll reply to ${esc(user.user_email)}.</p>
\t\t\t<form method="post" class="gff-acct__form">
\t\t\t\t${nonceField(c, "gff_acct_msg_" + uid, "gff_acct_msg_nonce")}\t\t\t\t<textarea name="gff_acct_message" rows="5" required placeholder="Type your message&hellip;"></textarea>
\t\t\t\t<button type="submit" class="gff-acct__btn">Send message</button>
\t\t\t</form>
\t\t</div>

\t\t<p class="gff-acct__logout"><a href="${escUrl(logoutUrl())}">Log out</a></p>
\t</div>
\t` + acctStyles() + "\t";
  return o;
}

/** [gff_my_farm]: the customer's saved farm, and the Spire and Three Sisters offers that fit their plan. */
export async function myFarm(c: Ctx, _atts: Atts = {}): Promise<string> {
  if (!loggedIn(c)) return '<div class="gff-myfarm gff-myfarm--guest"><p>Please log in to view your farm.</p></div>';
  const uid = c.uid;
  const post = postOf(c);
  const cr = await meta(c, uid, "gff_crops_wanted");
  const crops: unknown[] = Array.isArray(cr) ? cr : isArr(cr) ? Object.values(cr) : [];
  const layoutRaw = await meta(c, uid, "gff_farm_layout");
  const moringa = (await meta(c, uid, "gff_moringa_fruit_upgrade")) === "yes";
  const first = await meta(c, uid, "first_name");
  const unlocked = (await meta(c, uid, "gff_spire_unlocked")) === "yes";
  let spireNotice = "";

  if (!unlocked && post.gff_spire_unlock_nonce !== undefined) {
    const channel = sanitizeKey(pstr(post, "gff_spire_unlock_action"));
    if (["invoice", "paypal"].includes(channel)) {
      await setMeta(c, uid, "gff_spire_unlock_request", { channel, time: currentMysql(c), status: channel === "invoice" ? "invoice_requested" : "paypal_clicked" });
      await sendSpireUnlockEmail(c, uid, channel);
      if (channel === "invoice") spireNotice = '<div class="gff-acct__notice gff-acct__notice--ok">Invoice requested &mdash; watch your email. Your Spire designer unlocks here as soon as the $100 lands.</div>';
    }
  }
  if (unlocked && post.gff_spire_req_nonce !== undefined) {
    const reqQty = Math.max(1, Math.min(10, post.gff_spire_req_qty !== undefined ? phpInt(pstr(post, "gff_spire_req_qty")) : 1));
    const reqMonthly = sunriseSpireMonthly(reqQty);
    await setMeta(c, uid, "gff_spire_addon_request", { qty: reqQty, monthly: reqMonthly, time: currentMysql(c), status: "requested" });
    await sendSpireRequestEmail(c, uid, reqQty, reqMonthly);
    spireNotice = '<div class="gff-acct__notice gff-acct__notice--ok">Spires requested! We&rsquo;ll reach out to schedule your install &mdash; nothing is billed until we confirm together.</div>';
  }

  const chip = (n: unknown) => {
    const col = typeof n === "string" && COLORS[n] !== undefined ? COLORS[n] : "#888";
    return '<span class="gff-mf-chip"><span class="gff-mf-dot" style="background:' + esc(col) + '"></span>' + esc(n) + "</span>";
  };
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : isArr(v) ? Object.values(v) : []);

  let o = "\t<div class=\"gff-myfarm\">\n\t\t<h2 class=\"gff-mf-title\">" + (truthy(first) ? esc(first) + "&rsquo;s" : "Your") + " Farm</h2>\n\t\t";
  const layout: any = truthy(layoutRaw) ? await metaJson(c, uid, "gff_farm_layout") : null;
  if (isArr(layout) && notEmpty(layout.towers)) {
    o += '<p class="gff-mf-sub">Your Spire towers</p>';
    for (const tw of list(layout.towers) as any[]) {
      o += '<div class="gff-mf-tower"><div class="gff-mf-th">Tower ' + phpInt(isArr(tw) ? tw.tower : undefined) + '</div><div class="gff-mf-chips">';
      if (isArr(tw) && notEmpty(tw.plants)) { for (const pl of list(tw.plants)) o += chip(pl); } else o += '<span class="gff-mf-empty">We&rsquo;ll plant this one for you</span>';
      o += "</div></div>";
    }
    o += '<p class="gff-mf-herb">🌿 Plus a free herb garden at the base of every tower.</p>';
  } else if (isArr(layout) && notEmpty(layout.seasonal_spots)) {
    o += '<p class="gff-mf-sub">Your seasonal bed</p><div class="gff-mf-chips">';
    for (const pl of list(layout.seasonal_spots)) o += chip(pl);
    o += '</div><p class="gff-mf-herb">Your food-forest backbone (moringa, greens, tomatoes, peppers &amp; more) is included and planted for you.</p>';
  } else if (crops.length) {
    o += '<p class="gff-mf-sub">Plants you chose</p><div class="gff-mf-chips">';
    for (const pl of crops) o += chip(pl);
    o += "</div>";
  } else {
    o += '<p class="gff-mf-none">You haven&rsquo;t customized your planting yet &mdash; that&rsquo;s perfectly fine. We&rsquo;ll design a thriving farm for you. Want to choose? Reply to your welcome email or give us a call.</p>';
  }
  if (moringa) o += '<p class="gff-mf-up">🌳 Moringa &rarr; fruit tree upgrade selected <small>(invoiced separately, not at signup)</small></p>';

  if ((await customerOffer(c, uid)) === "sunrise" && !unlocked) {
    o += spireNotice;
    const req: any = await meta(c, uid, "gff_spire_unlock_request");
    const pending = isArr(req) && notEmpty(req.status);
    o += `\t\t\t<div class="gff-mf-unlock">
\t\t\t\t<button type="button" class="gff-mf-unlock__summon" id="gff-mf-unlock-summon">⚡ ${pending ? "Spire unlock pending&hellip;" : "Unlock Spire design"}</button>
\t\t\t\t<div class="gff-mf-unlock__panel" id="gff-mf-unlock-panel" hidden>
\t\t\t\t\t<p class="gff-mf-sub">🔒⚡ Unlock Spire design</p>
\t\t\t\t\t<p class="gff-mf-spires__deal"><strong>Climb to the top of the food chain.</strong> Unlock the Spire designer for <strong>$100</strong> and add vertical towers to your Sunrise farm &mdash; with your <strong>2nd Spire FREE</strong> (Sunrise exclusive) on top of the <strong>3rd free, forever</strong>, that everyone gets.</p>
\t\t\t\t\t`;
    if (pending) o += `\t\t\t\t\t\t<p class="gff-mf-spires__req">${req.status === "invoice_requested" ? "Invoice requested" : "Payment started"} on ${esc(mysql2date("M j", req.time))} &mdash; your designer unlocks as soon as the $100 lands.</p>
\t\t\t\t\t`;
    o += `\t\t\t\t\t<div class="gff-mf-unlock__actions">
\t\t\t\t\t\t<a class="gff-acct__btn" id="gff-mf-unlock-paypal" href="${escUrl(paypalLink(c))}" target="_blank" rel="noopener">Pay $100 with PayPal</a>
\t\t\t\t\t\t<form method="post" class="gff-mf-unlock__invform">
\t\t\t\t\t\t\t${nonceField(c, "gff_spire_unlock_" + uid, "gff_spire_unlock_nonce")}\t\t\t\t\t\t\t<input type="hidden" name="gff_spire_unlock_action" value="invoice">
\t\t\t\t\t\t\t<button type="submit" class="gff-mf-unlock__inv">or request an invoice</button>
\t\t\t\t\t\t</form>
\t\t\t\t\t</div>
\t\t\t\t\t<p class="gff-mf-herb">Once your $100 lands, the Spire designer unlocks right here on your account.</p>
\t\t\t\t</div>
\t\t\t</div>
\t\t\t<script>
\t\t\t(function(){
\t\t\t\tvar s=document.getElementById('gff-mf-unlock-summon'), p=document.getElementById('gff-mf-unlock-panel');
\t\t\t\tif(!s||!p) return;
\t\t\t\ts.onclick=function(){ p.hidden=!p.hidden; if(!p.hidden&&typeof gtag==='function'){gtag('event','spire_unlock_open',{event_category:'gff_funnel'});} };
\t\t\t\tvar pp=document.getElementById('gff-mf-unlock-paypal');
\t\t\t\tif(pp){ pp.addEventListener('click',function(){
\t\t\t\t\tif(typeof gtag==='function'){gtag('event','spire_unlock_paypal',{event_category:'gff_funnel',value:100});}
\t\t\t\t\ttry{
\t\t\t\t\t\tvar fd=new FormData();
\t\t\t\t\t\tfd.append('gff_spire_unlock_nonce','${escJs(nonce("gff_spire_unlock_" + uid))}');
\t\t\t\t\t\tfd.append('gff_spire_unlock_action','paypal');
\t\t\t\t\t\tif(navigator.sendBeacon){ navigator.sendBeacon(window.location.href, fd); }
\t\t\t\t\t\telse{ fetch(window.location.href,{method:'POST',body:fd,keepalive:true}); }
\t\t\t\t\t}catch(e){}
\t\t\t\t}); }
\t\t\t\tvar inv=document.querySelector('.gff-mf-unlock__invform');
\t\t\t\tif(inv&&typeof gtag==='function'){ inv.addEventListener('submit',function(){ gtag('event','spire_unlock_invoice',{event_category:'gff_funnel',value:100}); }); }
\t\t\t})();
\t\t\t</script>
\t\t\t`;
  }

  if ((await customerOffer(c, uid)) === "sunrise" && unlocked) {
    o += spireNotice;
    const req: any = await meta(c, uid, "gff_spire_addon_request");
    const firstP = towerFirstPrice();
    const addlP = towerAddlPrice();
    o += `\t\t\t<div class="gff-mf-spires">
\t\t\t\t<p class="gff-mf-sub">⚡ Add Spires to your farm</p>
\t\t\t\t<p class="gff-mf-spires__deal">Sunrise members only: your <strong>2nd Spire is FREE</strong> &mdash; on top of the <strong>3rd free, forever</strong>, that everyone gets. Vertical towers, 20 spots each, herb garden at the base included.</p>
\t\t\t\t`;
    if (isArr(req) && notEmpty(req.qty)) {
      o += `\t\t\t\t\t<p class="gff-mf-spires__req">You requested <strong>${phpInt(req.qty)} Spire${phpInt(req.qty) === 1 ? "" : "s"}</strong> on ${esc(mysql2date("M j", req.time))} &mdash; we&rsquo;ll be in touch to schedule. Changed your mind on the count? Just send a new request below.</p>
\t\t\t\t`;
    }
    o += `\t\t\t\t<form method="post" class="gff-mf-spires__form">
\t\t\t\t\t${nonceField(c, "gff_spire_req_" + uid, "gff_spire_req_nonce")}\t\t\t\t\t<div class="gff-mf-spires__step">
\t\t\t\t\t\t<button type="button" class="gff-mf-spires__sb" data-d="-1" aria-label="Fewer Spires">&minus;</button>
\t\t\t\t\t\t<span class="gff-mf-spires__q"><b id="gff-mf-sp-qty">2</b> Spires</span>
\t\t\t\t\t\t<button type="button" class="gff-mf-spires__sb" data-d="1" aria-label="More Spires">+</button>
\t\t\t\t\t</div>
\t\t\t\t\t<p class="gff-mf-spires__price"><span id="gff-mf-sp-total">$${firstP}/mo</span> <small id="gff-mf-sp-note"></small></p>
\t\t\t\t\t<input type="hidden" name="gff_spire_req_qty" id="gff-mf-sp-field" value="2">
\t\t\t\t\t<button type="submit" class="gff-acct__btn">Request my Spires</button>
\t\t\t\t\t<p class="gff-mf-herb">No charge now &mdash; we&rsquo;ll confirm scheduling and pricing with you first.</p>
\t\t\t\t</form>
\t\t\t</div>
\t\t\t<script>
\t\t\t(function(){
\t\t\t\tvar q=2, FIRST=${firstP}, ADDL=${addlP};
\t\t\t\tvar qEl=document.getElementById('gff-mf-sp-qty'), tEl=document.getElementById('gff-mf-sp-total'),
\t\t\t\t\tnEl=document.getElementById('gff-mf-sp-note'), fEl=document.getElementById('gff-mf-sp-field');
\t\t\t\tfunction total(n){ return FIRST + Math.max(0,n-3)*ADDL; }
\t\t\t\tfunction paint(){
\t\t\t\t\tqEl.textContent=q; fEl.value=q; tEl.textContent='$'+total(q)+'/mo';
\t\t\t\t\tvar free=Math.min(2, Math.max(0,q-1));
\t\t\t\t\tnEl.textContent = free>0 ? '— that’s '+free+' of them FREE 🎁' : '';
\t\t\t\t}
\t\t\t\tdocument.querySelectorAll('.gff-mf-spires__sb').forEach(function(b){
\t\t\t\t\tb.onclick=function(){ q=Math.max(1,Math.min(10,q+parseInt(b.getAttribute('data-d'),10))); paint(); };
\t\t\t\t});
\t\t\t\tpaint();
\t\t\t\tvar form=document.querySelector('.gff-mf-spires__form');
\t\t\t\tif(form&&typeof gtag==='function'){ form.addEventListener('submit',function(){ gtag('event','spire_addon_request',{event_category:'gff_funnel',value:q}); }); }
\t\t\t})();
\t\t\t</script>
\t\t\t`;
  }

  if ((await customerOffer(c, uid)) === "spire") {
    let tsReq: any = await meta(c, uid, "gff_three_sisters_request");
    let tsHas = isArr(tsReq) && notEmpty(tsReq.time);
    let tsJust = false;
    if (!tsHas && post.gff_three_sisters_nonce !== undefined && sanitizeKey(pstr(post, "gff_three_sisters_action")) === "request") {
      tsReq = { time: currentMysql(c), status: "requested" };
      await setMeta(c, uid, "gff_three_sisters_request", tsReq);
      await sendThreeSistersEmail(c, uid);
      tsHas = true; tsJust = true;
    }
    o += "\t\t\t<div class=\"gff-mf-sisters\">\n\t\t\t\t<p class=\"gff-mf-sub\">🌽 Three Sisters &mdash; grow your Spires</p>\n\t\t\t\t";
    if (tsJust) o += '<div class="gff-acct__notice gff-acct__notice--ok">Three Sisters requested! We&rsquo;ll send your $300 invoice &mdash; once it&rsquo;s paid, your first sister Spire propagates a year later.</div>';
    o += `\t\t\t\t<p class="gff-mf-spires__deal">Your Spires should multiply like a real garden. Add <strong>Three Sisters</strong> &mdash; a <strong>$300 one-time</strong> add-on &mdash; and each year we propagate <strong>one new sister Spire for every paid Spire you keep</strong>, grown from your own, <strong>free to service</strong>. Plant one, tend three, harvest for years.</p>
\t\t\t\t`;
    if (tsHas) {
      o += `\t\t\t\t\t<p class="gff-mf-spires__req">You requested Three Sisters on ${esc(mysql2date("M j", tsReq.time))} &mdash; we&rsquo;ll send your $300 invoice, and your first sister Spire propagates a year after it&rsquo;s paid.</p>
\t\t\t\t`;
    } else {
      o += `\t\t\t\t\t<form method="post" class="gff-mf-sisters__form">
\t\t\t\t\t\t${nonceField(c, "gff_three_sisters_" + uid, "gff_three_sisters_nonce")}\t\t\t\t\t\t<input type="hidden" name="gff_three_sisters_action" value="request">
\t\t\t\t\t\t<button type="submit" class="gff-acct__btn">Add Three Sisters &mdash; $300 one time</button>
\t\t\t\t\t</form>
\t\t\t\t\t<p class="gff-mf-herb">No charge now &mdash; we&rsquo;ll send a secure $300 invoice, then your first sister propagates a year later.</p>
\t\t\t\t`;
    }
    o += `\t\t\t</div>
\t\t\t<script>
\t\t\t(function(){ var f=document.querySelector('.gff-mf-sisters__form'); if(f&&typeof gtag==='function'){ f.addEventListener('submit',function(){ gtag('event','three_sisters_request',{event_category:'gff_funnel',value:300}); }); } })();
\t\t\t</script>
\t\t\t`;
  }

  const ak = await meta(c, uid, "gff_addons");
  const keys: unknown[] = Array.isArray(ak) ? ak : isArr(ak) ? Object.values(ak) : [];
  const catalog = addons();
  const known = (k: unknown) => (typeof k === "string" || typeof k === "number") && catalog[String(k)] !== undefined;
  if (keys.some(known)) {
    o += '<p class="gff-mf-sub">Your add-ons</p><div class="gff-mf-addons">';
    for (const k of keys) {
      if (!known(k)) continue;
      const ad = catalog[String(k)];
      o += '<div class="gff-mf-addon"><span class="gff-mf-ae">' + esc(ad.emoji) + "</span>"
        + '<span class="gff-mf-an"><b>' + esc(ad.name) + "</b>"
        + "<small>" + esc(ad.desc) + "</small></span>"
        + '<span class="gff-mf-ap">$' + esc(ad.price) + "</span></div>";
    }
    o += '</div><p class="gff-mf-herb">Add-ons are invoiced separately &mdash; we&rsquo;ll send a secure payment link.</p>';
  }
  const notes = str(await meta(c, uid, "gff_addons_notes"));
  if (phpTrim(notes) !== "") o += '<p class="gff-mf-sub">Additional add-ons</p><div class="gff-mf-notes">' + nl2br(esc(notes)) + "</div>";
  return o + "\t</div>\n" + MY_FARM_STYLE;
}

/** [gff_account_planner]: the customer's own planner, in their plan's mode; saves a posted layout first. */
export async function accountPlanner(c: Ctx, _atts: Atts = {}): Promise<string> {
  if (!loggedIn(c)) return "";
  const uid = c.uid;
  const post = postOf(c);
  const offer = await customerOffer(c, uid);
  const mode = offer === "sunrise" || offer === "spire" ? offer : "both";
  let notice = "";
  if (post.gff_planner_nonce !== undefined) {
    const parsed = parseLayout(post.gff_farm_layout ?? "");
    if (parsed && parsed.flat.length) {
      await setMeta(c, uid, "gff_farm_layout", phpJson(parsed.layout));
      await setMeta(c, uid, "gff_crops_wanted", parsed.flat);
      await setMeta(c, uid, "gff_moringa_fruit_upgrade", parsed.moringa_upgrade ? "yes" : "no");
      const chosen = parsed.layout.offer !== undefined ? parsed.layout.offer : "";
      if (offers().includes(chosen)) await setMeta(c, uid, "gff_offer", chosen);
      notice = '<div class="gff-acct__notice gff-acct__notice--ok">Your planting plan is saved — we&rsquo;ll follow it on our next visit.</div>';
    } else {
      notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please add at least one plant to a spot, then save again.</div>';
    }
  }
  const title = mode === "both" ? "🌱 Choose your garden" : offer === "spire" ? "⚡ Your Spire spots" : "🌅 Your seasonal bed";
  const sub = mode === "both"
    ? "Pick your style — 🌅 Sunrise seasonal bed or ⚡ Spire towers — then fill your spots. Save any time; we plant it on our next visit."
    : offer === "spire"
      ? "Fill each tower&rsquo;s 20 spots with what you want growing. Save any time — we plant it on our next visit."
      : "Fill your 20 seasonal-bed spots with what you want growing. Save any time — we plant it on our next visit.";
  return `\t<div class="gff-acct-planner">
\t\t<h3 class="gff-acct__h3">${title}</h3>
\t\t<p class="gff-acct__sub">${sub}</p>
\t\t${notice}\t\t<form method="post" id="gff-planner-form">
\t\t\t${nonceField(c, "gff_planner_" + uid, "gff_planner_nonce")}\t\t\t${await farmBuilder(c, { mode: esc(mode), user: "current" })}\t\t\t<button type="submit" class="gff-acct__btn">Save my planting plan</button>
\t\t\t<span class="gff-planner-status" aria-live="polite" style="margin-left:10px;font-size:13px;color:#1c1c1a;"></span>
\t\t</form>
\t</div>
\t<script>
\t/* Autosave the garden as it changes — customers never lose work, and staff
\t * see edits on their next load. Guards against wiping a saved garden: the
\t * server ignores empty/partial layouts. */
\t(function(){
\t\tvar form=document.getElementById('gff-planner-form'); if(!form) return;
\t\tvar hidden=form.querySelector('input[name="gff_farm_layout"]');
\t\tvar nonceEl=form.querySelector('input[name="gff_planner_nonce"]');
\t\tvar status=form.querySelector('.gff-planner-status');
\t\tif(!hidden||!nonceEl) return;
\t\tvar AJAX='${escJs(adminUrl(c, "admin-ajax.php"))}';
\t\tvar last=hidden.value, busy=false;
\t\tfunction save(beacon){
\t\t\tvar val=hidden.value;
\t\t\tif(val===last||busy) return;
\t\t\tvar fd=new FormData();
\t\t\tfd.append('action','gff_planner_autosave');
\t\t\tfd.append('nonce',nonceEl.value);
\t\t\tfd.append('gff_farm_layout',val);
\t\t\tif(beacon){ if(navigator.sendBeacon){ navigator.sendBeacon(AJAX,fd); last=val; } return; }
\t\t\tbusy=true;
\t\t\tfetch(AJAX,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
\t\t\t\tbusy=false;
\t\t\t\tif(j&&j.success){ last=val; if(status){ status.textContent='Saved '+j.data.saved; } }
\t\t\t}).catch(function(){ busy=false; });
\t\t}
\t\tsetInterval(function(){ save(false); },4000);
\t\tdocument.addEventListener('visibilitychange',function(){ if(document.hidden){ save(true); } });
\t\twindow.addEventListener('beforeunload',function(){ save(true); });
\t})();
\t</script>
\t`;
}

/** [gff_farm_builder mode="both|sunrise|spire" user="current|<id>"]: the interactive builder, optionally preloaded with a customer's saved farm. */
export async function farmBuilder(c: Ctx, atts: Atts = {}): Promise<string> {
  const a = shortcodeAtts({ mode: "both", user: "" }, atts);
  let init = "";
  let cur = 0;
  if (a.user === "current" && loggedIn(c)) cur = c.uid;
  else if (/^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(a.user) && Math.trunc(Number(a.user)) > 0) cur = Math.trunc(Number(a.user));
  if (cur) {
    const saved = await metaJson(c, cur, "gff_farm_layout");
    const obj: Record<string, any> = isArr(saved) ? Object.assign({}, saved) : {};
    if (!notEmpty(obj.offer)) obj.offer = a.mode === "spire" ? "spire" : "sunrise";
    const q = phpInt(await meta(c, cur, "gff_tower_qty"));
    if (q > 0) obj.qty = q;
    obj.moringa = (await meta(c, cur, "gff_moringa_fruit_upgrade")) === "yes";
    init = phpJson(obj);
  }
  return fill(FARM_BUILDER_T, {
    SFX: "fb" + md5(uniqid(c)).slice(0, 6),
    MODE: esc(a.mode),
    INIT: init ? ' data-init="' + esc(init) + '"' : "",
  });
}
