/**
 * Section 8: [fppm_account] — the signed-out view (sign in + the join form),
 * "finish your membership" for a bare sign-in (and its fppm_complete
 * handler), the member dashboard and its cards (dues, promo code, invite,
 * apparel, schedule, team updates, your info, delete my account), the ticker,
 * the app-install card, the player invite's accept card and handler, and
 * [fppm_merch].
 */
import { type Ctx, adminUrl, homeUrl, loginUrl, logoutUrl, meta, opt, setMeta, deleteMeta } from "../ctx";
import { esc, escUrl, numberFormat, phpFloat, phpInt, phpJson, phpNum, rawurlencode, truthy } from "../php";
import { sanitizeKey, sanitizeTextField } from "../wpfn";
import { addQueryArg, addRole, currentMysql, DieReply, RedirectReply, updateUserNames, mysql2date } from "../wp";
import type { AjaxCtx } from "../ajax";
import {
  addressLine, apparelItems, type ApparelItem, assetUrl, assignMemberCode, canManage, collective, couponPercent, displayName, duesAdd, duesGet, duesOutstanding,
  flashHtml, isArr, memberCount, oathText, paypalButton, playerStatusOf, POSITIONS, positionName, ppLink, pricePlayerDues, priceSupporterMin, redirectNote, shopUrl,
  SHIRT_SIZES, statusLabel, str, styles, teamName, typeLabel, typeOf, TYPES, waiverHash, waiverText, waiverVersion, wcActive,
} from "./core";
import { joinUrl } from "./gate";
import { scheduleMemberHtml } from "./events";
import { escJs, storeHtml, storeReady } from "./store";
import { staffDashboard } from "./staff";
import { googleButton, scRegister } from "./register";
import { waiverRecordOffsite } from "./waivers";
import { nonceField } from "./ui";
import { FPPM_COMPLETE_FORM, FPPM_INSTALL_CARD } from "./templates.gen";

/** fppm_sc_account(). */
export async function scAccount(c: Ctx): Promise<string> {
  if (!c.uid) return loggedOutAccount(c);
  if (await canManage(c)) return staffDashboard(c);
  if (!(await memberComplete(c, c.uid))) return completeForm(c);
  return memberDashboard(c);
}

/** fppm_member_complete(): type, waiver, oath and ZIP on file. */
export async function memberComplete(c: Ctx, uid: number): Promise<boolean> {
  if (!truthy(await meta(c, uid, "fppm_type"))) return false;
  const w = await meta(c, uid, "fppm_waiver");
  if (!isArr(w) || !truthy(w.accepted)) return false;
  const o = await meta(c, uid, "fppm_oath");
  if (!isArr(o) || !truthy(o.accepted)) return false;
  if (!truthy(await meta(c, uid, "fppm_zip"))) return false;
  return true;
}

/** fppm_logged_out_account(): a sign-in bar above the join form. */
export async function loggedOutAccount(c: Ctx): Promise<string> {
  const g = googleButton(c);
  let o = styles(c) + '<div class="fppm-wrap"><div class="fppm-card" style="text-align:center;">';
  o += '<p style="margin:0 0 .6rem;font-weight:600;">Already a member? Sign in</p>';
  if (g) o += '<div style="margin:0 0 .6rem;">' + g + "</div>";
  o += '<a class="fppm-btn fppm-btn--ghost" href="' + escUrl(loginUrl(homeUrl(c, "/account/"))) + '">Sign in with email</a>';
  o += "</div></div>";
  return o + (await scRegister(c));
}

/** fppm_complete_form(): finish joining, for a signed-in person missing the membership details. */
export async function completeForm(c: Ctx): Promise<string> {
  const uid = c.uid;
  const first = str(await meta(c, uid, "first_name")), last = str(await meta(c, uid, "last_name"));
  const err = c.regErr !== undefined ? c.regErr : c.get.fppm_err !== undefined ? sanitizeTextField(str(c.get.fppm_err)) : "";
  const T = FPPM_COMPLETE_FORM;
  let o = styles(c);
  o += T[0] + escUrl(assetUrl(c, "icon-192.png")) + T[1] + esc(collective(c)) + T[2] + esc(c.user?.user_email ?? "") + T[3];
  if (truthy(err)) o += T[4] + esc(err) + T[5];
  o += T[6] + escUrl(adminUrl(c, "admin-post.php")) + T[7] + nonceField(c, "fppm_complete") + T[8] + esc(numberFormat(pricePlayerDues(c), 0)) + T[9] + esc(numberFormat(priceSupporterMin(c), 0))
    + T[10] + esc(first) + T[11] + esc(last) + T[12] + esc(await meta(c, uid, "fppm_phone")) + T[13];
  for (const [ab, fu] of POSITIONS) o += '<option value="' + esc(ab) + '">' + esc(ab + " — " + fu) + "</option>";
  o += T[14];
  for (const sz of SHIRT_SIZES) o += "<option>" + esc(sz) + "</option>";
  const min = esc(phpNum(priceSupporterMin(c)));
  o += T[15] + esc(numberFormat(priceSupporterMin(c), 0)) + T[16] + min + T[17] + min + T[18] + esc(waiverVersion(c)) + T[19] + esc(waiverText(c)) + T[20] + esc(oathText(c)) + T[21];
  return o;
}

/** fppm_h_complete() (admin-post fppm_complete). */
export async function hComplete(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  const uid = c.uid;
  if (!uid) return new DieReply("Please sign in.");
  const fail = (msg: string) => new RedirectReply(addQueryArg({ fppm_err: rawurlencode(msg) }, homeUrl(c, "/account/")));
  const p = (k: string) => (c.post[k] !== undefined ? sanitizeTextField(str(c.post[k])) : "");
  let type = c.post.fppm_type !== undefined ? sanitizeKey(str(c.post.fppm_type)) : "fan";
  if (!Object.prototype.hasOwnProperty.call(TYPES, type)) type = "fan";
  const first = p("fppm_first"), last = p("fppm_last"), phone = p("fppm_phone"), addr = p("fppm_address"), city = p("fppm_city"), state = asciiUpper(p("fppm_state")), zip = p("fppm_zip");
  if (first === "" || last === "" || phone === "" || addr === "" || city === "" || state === "" || zip === "") return fail("Please fill in your name, phone and full address.");
  if (!truthy(c.post.fppm_waiver_accept)) return fail("You must accept the liability waiver.");
  if (!truthy(c.post.fppm_oath_accept)) return fail("You must take the Purple Martins oath.");

  await updateUserNames(c, uid, first, last, (first + " " + last).trim());
  await setMeta(c, uid, "fppm_type", type);
  await setMeta(c, uid, "fppm_phone", phone);
  await setMeta(c, uid, "fppm_address", addr);
  await setMeta(c, uid, "fppm_city", city);
  await setMeta(c, uid, "fppm_state", state);
  await setMeta(c, uid, "fppm_zip", zip);
  if (!truthy(await meta(c, uid, "fppm_joined"))) await setMeta(c, uid, "fppm_joined", currentMysql(c));
  const ip = sanitizeTextField(c.ip), ua = sanitizeTextField(c.ua ?? "").slice(0, 300);
  await setMeta(c, uid, "fppm_waiver", { accepted: 1, version: waiverVersion(c), hash: waiverHash(c), at: currentMysql(c), ip, ua, name: (first + " " + last).trim(), email: c.user?.user_email ?? "" });
  await setMeta(c, uid, "fppm_oath", { accepted: 1, at: currentMysql(c), text: oathText(c) });
  if (type === "player") {
    if (!truthy(await meta(c, uid, "fppm_player_status"))) await setMeta(c, uid, "fppm_player_status", "trialist");
    await setMeta(c, uid, "fppm_dob", p("fppm_dob"));
    const pos = p("fppm_position");
    if (POSITIONS.some(([k]) => k === pos)) await setMeta(c, uid, "fppm_position", pos);
    await setMeta(c, uid, "fppm_jersey", c.post.fppm_jersey !== undefined ? str(c.post.fppm_jersey).replace(/[^0-9]/g, "") : "");
    await setMeta(c, uid, "fppm_ec_name", p("fppm_ec_name"));
    await setMeta(c, uid, "fppm_ec_phone", p("fppm_ec_phone"));
    if (!(await duesGet(c, uid)).length) await duesAdd(c, uid, pricePlayerDues(c), "Player dues");
  } else if (type === "supporter") {
    const shirt = p("fppm_shirt");
    if (SHIRT_SIZES.includes(shirt)) await setMeta(c, uid, "fppm_shirt", shirt);
    let contrib = c.post.fppm_contribution !== undefined ? phpFloat(str(c.post.fppm_contribution)) : priceSupporterMin(c);
    if (contrib < priceSupporterMin(c)) contrib = priceSupporterMin(c);
    await setMeta(c, uid, "fppm_contribution", numberFormat(contrib, 2).replace(/,/g, ""));
    if (!(await duesGet(c, uid)).length) await duesAdd(c, uid, contrib, "Supporter contribution (incl. tee + " + numberFormat(couponPercent(c), 0) + "% merch code)");
  }
  await assignMemberCode(c, uid, first, last);
  if (!c.user!.roles.includes("fppm_member") && !(await canManage(c, uid))) await addRole(c, uid, "fppm_member");
  await waiverRecordOffsite(c, uid);
  return new RedirectReply(addQueryArg({ fppm_note: "registered" }, homeUrl(c, "/account/")));
}
/** PHP 8's strtoupper(): ASCII letters only. */
export const asciiUpper = (s: string) => s.replace(/[a-z]/g, (ch) => ch.toUpperCase());

/** fppm_member_dashboard(). */
export async function memberDashboard(c: Ctx): Promise<string> {
  const uid = c.uid;
  const type = await typeOf(c, uid);
  const name = await displayName(c, uid);
  const owe = await duesOutstanding(c, uid);
  let o = styles(c);
  o += '<div class="fppm-wrap">';
  o += '<h2 class="fppm-h"><img class="fppm-crest-img" src="' + escUrl(assetUrl(c, "icon-192.png")) + '" alt=""> ' + esc(name) + "</h2>";
  o += '<p class="fppm-sub"><span class="fppm-badge fppm-badge--gold">' + esc(collective(c)) + '</span> <span class="fppm-badge">' + esc(typeLabel(type)) + "</span>";
  if (type === "player") o += ' <span class="fppm-badge">' + esc(statusLabel(await playerStatusOf(c, uid))) + "</span>";
  o += "</p>";
  o += await tickerHtml(c);
  o += flashHtml(c);
  o += installCard(c);
  o += await playerAcceptCard(c, uid);
  if (type !== "fan") {
    o += '<div class="fppm-card"><h3>' + (type === "player" ? "Dues" : "Contribution") + "</h3>";
    if (owe > 0) {
      o += '<p>You have <strong class="fppm-badge fppm-badge--owe">$' + esc(numberFormat(owe, 2)) + " outstanding</strong>.</p>";
      o += "<p>" + payButton(c, type) + "</p>";
      o += '<p class="fppm-muted">After you pay, a staff member marks it received (usually same day).</p>';
    } else {
      o += '<p><span class="fppm-badge fppm-badge--paid">All paid up</span> — thank you!</p>';
    }
    o += "</div>";
  }
  const coupon = await meta(c, uid, "fppm_coupon");
  if (truthy(coupon) && type !== "fan") {
    o += '<div class="fppm-card" style="background:var(--fppm-gold-l);border-color:var(--fppm-gold);">';
    o += "<h3>Your member promo code</h3>";
    o += "<p>Your personal <strong>" + esc(numberFormat(couponPercent(c), 0)) + "% off</strong> code for the whole merch store:</p>";
    o += "<p style=\"font-family:'Oswald',monospace;font-size:1.6rem;font-weight:700;letter-spacing:2px;color:var(--fppm-purple-d);background:#fff;border:2px dashed var(--fppm-gold);border-radius:10px;padding:.4em .6em;display:inline-block;\">" + esc(coupon) + "</p>";
    o += '<p class="fppm-muted">Enter it at checkout in the ' + esc(truthy(shopUrl(c)) ? "store" : "merch store") + ". Thanks for backing the " + esc(collective(c)) + "!</p>";
    o += "</div>";
  }
  o += inviteCard(c);
  o += await apparelBlock(c);
  o += await scheduleMemberHtml(c, uid);
  o += announcementsHtml(c);
  o += '<div class="fppm-card"><h3>Your info</h3><table class="fppm-table"><tbody>';
  const rows: [string, string][] = [["Email", c.user?.user_email ?? ""], ["Phone", str(await meta(c, uid, "fppm_phone"))], ["Address", await addressLine(c, uid)]];
  if (type === "player") {
    const pos = str(await meta(c, uid, "fppm_position"));
    rows.push(["Position", truthy(pos) ? pos + " — " + (positionName(pos) ?? "") : "—"]);
    rows.push(["Jersey #", str(await meta(c, uid, "fppm_jersey"))]);
    rows.push(["Emergency", (str(await meta(c, uid, "fppm_ec_name")) + " " + str(await meta(c, uid, "fppm_ec_phone"))).trim()]);
  }
  if (type === "supporter") rows.push(["Shirt size", str(await meta(c, uid, "fppm_shirt"))]);
  const wv = await meta(c, uid, "fppm_waiver");
  if (isArr(wv) && truthy(wv.accepted)) rows.push(["Waiver", "Accepted v" + (wv.version !== undefined && wv.version !== null ? str(wv.version) : "") + (wv.at !== undefined && wv.at !== null ? " · " + str(mysql2date("M j, Y", wv.at)) : "")]);
  const ov = await meta(c, uid, "fppm_oath");
  if (isArr(ov) && truthy(ov.accepted)) rows.push(["Oath", "Taken" + (ov.at !== undefined && ov.at !== null ? " · " + str(mysql2date("M j, Y", ov.at)) : "")]);
  for (const [k, val] of rows) o += '<tr><th style="width:35%;">' + esc(k) + "</th><td>" + esc(truthy(val) ? val : "—") + "</td></tr>";
  o += "</tbody></table>";
  o += '<p class="fppm-muted" style="margin-top:.8em;"><a href="' + escUrl(logoutUrl()) + '">Sign out</a></p>';
  o += "</div>";
  o += '<details class="fppm-card" style="border-color:var(--fppm-ink);"><summary style="cursor:pointer;font-weight:700;color:var(--fppm-ink);">Delete my account</summary>';
  o += "<p class=\"fppm-muted\" style=\"margin:.6em 0;\">This permanently removes your account and all your info. It can't be undone. Any unpaid dues records are removed too.</p>";
  o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + "\" onsubmit=\"return confirm('Permanently delete your Purple Martins account? This cannot be undone.');\">";
  o += '<input type="hidden" name="action" value="fppm_self_delete">';
  o += nonceField(c, "fppm_self_delete_" + uid);
  o += '<button class="fppm-btn" style="background:var(--fppm-ink);" type="submit">Yes, delete my account</button>';
  o += "</form></details>";
  o += "</div>";
  return o;
}

/** fppm_apparel_block(): the in-plugin store when it is set up (signed in), else the Printful links. */
export async function apparelBlock(c: Ctx): Promise<string> {
  if (storeReady(c) && c.uid) return storeHtml(c);
  const shop = shopUrl(c);
  let o = '<div class="fppm-card"><h3>Team apparel</h3>';
  if (truthy(shop)) o += '<p><a class="fppm-btn fppm-btn--ghost" href="' + escUrl(shop) + '" target="_blank" rel="noopener">🛍️ Shop all apparel</a></p>';
  o += '<div class="fppm-apparel">';
  for (const item of apparelItems(c)) {
    o += '<div class="fppm-appcard">';
    o += "<b>" + esc(item.label) + "</b>";
    if (truthy(item.desc)) o += '<div class="fppm-muted">' + esc(item.desc) + "</div>";
    if (item.emb !== undefined && item.emb !== null) {
      o += '<div class="fppm-price">$' + esc(numberFormat(item.price, 0)) + ' <span style="font-size:.6em;font-weight:500;color:var(--fppm-muted);">printed</span> · $' + esc(numberFormat(item.emb, 0)) + ' <span style="font-size:.6em;font-weight:500;color:var(--fppm-muted);">embroidered</span></div>';
    } else {
      o += '<div class="fppm-price">$' + esc(numberFormat(item.price, 2)) + "</div>";
    }
    o += apparelBuyButton(c, item);
    o += "</div>";
  }
  o += '</div><p class="fppm-muted" style="margin-top:.7em;">Apparel ships on-demand via Printful. More gear coming soon.</p></div>';
  return o;
}
/** fppm_wc_link_button(): WooCommerce is not active here, so never a button. */
const wcLinkButton = (c: Ctx, _pid: number) => (wcActive(c) ? "" : "");
function apparelBuyButton(c: Ctx, item: ApparelItem): string {
  if (item.emb !== undefined && item.emb !== null) {
    const p = wcLinkButton(c, item.wc_id), e = wcLinkButton(c, item.emb_id ?? item.wc_id);
    if (p || e) return '<div class="fppm-actions">' + p + e + "</div>";
  }
  const b = wcLinkButton(c, item.wc_id);
  if (b) return b;
  if (truthy(item.url)) {
    const label = "Buy" + (truthy(item.price) ? " — $" + numberFormat(item.price, 0) : "") + " →";
    return '<a class="fppm-btn fppm-btn--gold" href="' + escUrl(item.url) + '" target="_blank" rel="noopener">' + esc(label) + "</a>";
  }
  const pp = truthy(item.pp_key) ? ppLink(c, item.pp_key) : "";
  if (pp) return paypalButton(pp, "Buy with PayPal");
  return paypalButton("", "Buy");
}
/** [fppm_merch]. */
export async function scMerch(c: Ctx): Promise<string> {
  return styles(c) + '<div class="fppm-wrap">' + (await apparelBlock(c)) + "</div>";
}

/** fppm_pay_button(): the PayPal link for a member's dues or contribution (WooCommerce, the other route, is not active). */
export function payButton(c: Ctx, type: string): string {
  const link = type === "supporter" ? ppLink(c, "fppm_pp_supporter") : ppLink(c, "fppm_pp_dues");
  const label = type === "supporter" ? "Contribute with PayPal" : "Pay dues with PayPal";
  return paypalButton(link, label);
}

/** fppm_shirts_sold(): the starting count plus the store's tee sales (WooCommerce's would add, but it is not active). */
export const shirtsSold = (c: Ctx) => phpInt(opt(c, "fppm_shirts_sold_manual", 0)) + phpInt(opt(c, "fppm_store_shirts_sold", 0));
/** fppm_ticker_visible(): only once the club has 89 members and 12 shirts sold. */
export async function tickerVisible(c: Ctx): Promise<boolean> {
  return (await memberCount(c)) >= 89 && shirtsSold(c) >= 12;
}
export async function tickerHtml(c: Ctx): Promise<string> {
  if (!(await tickerVisible(c))) return "";
  const m = await memberCount(c), s = shirtsSold(c);
  return '<div class="fppm-ticker"><div class="fppm-stat"><span class="fppm-stat-n">' + esc(numberFormat(m, 0)) + '</span><span class="fppm-stat-l">Members</span></div>'
    + '<div class="fppm-stat"><span class="fppm-stat-n">' + esc(numberFormat(s, 0)) + '</span><span class="fppm-stat-l">Shirts sold</span></div></div>';
}

/** fppm_invite_card(): the join link to copy, text, email or share. */
export function inviteCard(c: Ctx): string {
  const url = joinUrl(c);
  const share = "Join the " + teamName(c) + " — " + url;
  let o = '<div class="fppm-card" style="border-color:var(--fppm-gold);background:var(--fppm-gold-l);">';
  o += "<h3>Grow the " + esc(collective(c)) + "</h3>";
  o += "<p>Know someone who'd back the Martins? Send them the join link — anyone can sign up as a <strong>fan</strong> (free), <strong>player</strong>, or <strong>supporter</strong>.</p>";
  o += '<div class="fppm-actions" style="align-items:center;gap:.5rem;">';
  o += '<input type="text" readonly value="' + esc(url) + '" onclick="this.select()" id="fppm-inv-url" style="flex:1 1 200px;min-width:0;padding:.5em .7em;border:1px solid var(--fppm-line);border-radius:9px;font-size:.9rem;">';
  o += "<button type=\"button\" class=\"fppm-btn fppm-btn--ghost\" onclick=\"var i=document.getElementById('fppm-inv-url');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);this.textContent='Copied!';\">Copy link</button>";
  o += '</div><div class="fppm-actions" style="margin-top:.6rem;">';
  o += '<a class="fppm-btn" id="fppm-inv-sms" href="sms:?&body=' + rawurlencode(share) + '">Text it</a>';
  o += '<a class="fppm-btn fppm-btn--ghost" href="mailto:?subject=' + rawurlencode("Join the Fort Pierce Purple Martins") + "&body=" + rawurlencode(share) + '">Email it</a>';
  o += "<button type=\"button\" class=\"fppm-btn fppm-btn--ghost\" onclick=\"navigator.share?navigator.share({title:'" + escJs(teamName(c)) + "',url:'" + escJs(url) + "'}):document.getElementById('fppm-inv-url').select()\">Share…</button>";
  o += "</div></div>";
  o += '<script>(function(){var a=document.getElementById("fppm-inv-sms");if(!a){return;}var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);a.href="sms:"+(ios?"&":"?")+"body="+' + phpJson(rawurlencode(share)) + ";})();</script>";
  return o;
}

/** fppm_install_card(): "Get the app on your phone" (shown on phones only, by its script). */
export function installCard(c: Ctx): string {
  const icon = escUrl(assetUrl(c, "icon-192.png"));
  const host = new URL(c.origin).hostname;
  const T = FPPM_INSTALL_CARD;
  return T[0] + esc(teamName(c)) + T[1] + icon + T[2] + esc(host) + T[3];
}

/** fppm_announcements_html(): the five latest team updates. */
export function announcementsHtml(c: Ctx, limit = 5): string {
  const raw = opt(c, "fppm_announcements", []);
  const list = Array.isArray(raw) ? raw : isArr(raw) ? Object.values(raw) : [];
  if (!list.length) return "";
  let o = '<div class="fppm-card"><h3>Team updates</h3>';
  for (const a of [...list].reverse().slice(0, limit)) {
    o += '<div style="border-bottom:1px solid var(--fppm-line);padding:.5em 0;">';
    o += "<strong>" + esc(a?.title) + '</strong> <span class="fppm-muted">· ' + esc(str(mysql2date("M j, Y", a?.at))) + "</span>";
    o += "<div>" + nl2br(esc(a?.body)) + "</div>";
    o += "</div>";
  }
  return o + "</div>";
}
/** nl2br(). */
export const nl2br = (s: string) => s.replace(/(\r\n|\n\r|\n|\r)/g, "<br />$1");

/* ---- Player invite → accept ---- */
export async function playerInvitePending(c: Ctx, uid: number): Promise<boolean> { const i = await meta(c, uid, "fppm_player_invite"); return isArr(i) && truthy(i.pending); }
export async function playerActive(c: Ctx, uid: number): Promise<boolean> { return str(await meta(c, uid, "fppm_player_active")) === "1"; }
export async function playerAcceptCard(c: Ctx, uid: number): Promise<string> {
  if (!(await playerInvitePending(c, uid))) return "";
  let o = '<div class="fppm-card" style="border-color:var(--fppm-gold);background:var(--fppm-gold-l);">';
  o += "<h3>You're invited to the roster</h3>";
  o += "<p>An admin invited you to join the " + esc(teamName(c)) + " as a <strong>player</strong>. Accept to activate your player account.</p>";
  o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '">';
  o += '<input type="hidden" name="action" value="fppm_accept_invite">';
  o += nonceField(c, "fppm_accept_invite_" + uid);
  o += '<button class="fppm-btn" type="submit">Accept player invite</button></form></div>';
  return o;
}
export async function hAcceptInvite(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  const uid = c.uid;
  if (!uid) return new DieReply("Please sign in.");
  if (await playerInvitePending(c, uid)) {
    await setMeta(c, uid, "fppm_type", "player");
    await setMeta(c, uid, "fppm_player_status", "rostered");
    await setMeta(c, uid, "fppm_player_active", "1");
    await setMeta(c, uid, "fppm_player_activated", currentMysql(c));
    await deleteMeta(c, uid, "fppm_player_invite");
    return redirectNote(c, "playeractive");
  }
  return redirectNote(c, "err");
}
