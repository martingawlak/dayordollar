/**
 * Section 7: the join form ([fppm_register], [fppm_invite]) and its handler
 * (the template_redirect hook fppm_maybe_handle_register).
 *
 * Intended differences (MIGRATION.md): the form has no password field, and
 * a new member is not signed in by the handler — they are sent to the shared
 * accounts sign-in (email code or Google), which proves the address is
 * theirs, and land on /account/?fppm_note=registered. The Google button is
 * Nextend's markup pointing at that sign-in.
 */
import { type Ctx, homeUrl, loginUrl, setMeta } from "../ctx";
import { esc, escUrl, numberFormat, phpFloat, phpNum, truthy } from "../php";
import { isEmail, sanitizeEmail, sanitizeKey, sanitizeTextField } from "../wpfn";
import { currentMysql, emailExists, insertUser, isWPError, RedirectReply, sanitizeUser, sendMail, usernameExists, addQueryArg } from "../wp";
import type { AjaxCtx } from "../ajax";
import {
  assignMemberCode, collective, couponPercent, duesAdd, joinIntro, notifyEmail, oathText, POSITIONS, pricePlayerDues, priceSupporterMin, SHIRT_SIZES,
  str, styles, teamCity, teamName, typeLabel, TYPES, waiverHash, waiverText, waiverVersion, assetUrl,
} from "./core";
import { nextEventPublicHtml } from "./events";
import { asciiUpper, tickerHtml } from "./account";
import { merchTeaserHtml } from "./store";
import { waiverRecordOffsite } from "./waivers";
import { nonceField, selected, checked } from "./ui";
import { FPPM_SC_REGISTER } from "./templates.gen";

/** The password field the plugin's form had (intended difference: sign-in has no passwords). */
export const PASSWORD_FIELD = '\t\t\t<div class="fppm-field"><label>Choose a password *</label><input type="password" name="fppm_pass" autocomplete="new-password" minlength="8" required><small class="fppm-muted">At least 8 characters. You\'ll use your email + this password to sign in.</small></div>\n';
const T = FPPM_SC_REGISTER.map((x, i) => (i === 25 ? x.replace(PASSWORD_FIELD, "") : x));
if (T[25] === FPPM_SC_REGISTER[25]) throw new Error("the join form's password field moved: update register.ts");

/**
 * fppm_google_button(): Nextend Social Login's Google button (as fppm.us printed it), sending people
 * to the shared accounts sign-in, which offers Google (and an emailed code), back to this page.
 */
export function googleButton(c: Ctx): string {
  const back = c.requestUri.split("?")[0] || "/";
  return '<div class="nsl-container nsl-container-block" data-align="left"><div class="nsl-container-buttons"><a href="' + escUrl(loginUrl(c.origin + back)) + '" rel="nofollow" aria-label="Continue with &lt;b&gt;Google&lt;/b&gt;" data-provider="google"><div class="nsl-button nsl-button-default nsl-button-google" data-skin="light" style="background-color:#fff;"><div class="nsl-button-svg-container"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M20.64 12.2045c0-.6381-.0573-1.2518-.1636-1.8409H12v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"></path><path fill="#34A853" d="M12 21c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H3.9574v2.3318C5.4382 18.9832 8.4818 21 12 21z"></path><path fill="#FBBC05" d="M6.964 13.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V7.9582H3.9573A8.9965 8.9965 0 0 0 3 12c0 1.4523.3477 2.8268.9573 4.0418L6.964 13.71z"></path><path fill="#EA4335" d="M12 6.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C16.4632 3.8918 14.426 3 12 3 8.4818 3 5.4382 5.0168 3.9573 7.9582L6.964 10.29C7.6718 8.1627 9.6559 6.5795 12 6.5795z"></path></svg></div><div class="nsl-button-label-container">Continue with <b>Google</b></div></div></a></div></div>';
}

/** fppm_sc_register(): the join form (or "already signed in"). */
export async function scRegister(c: Ctx, atts: Record<string, string> = {}): Promise<string> {
  const a = { default: "fan", ...atts };
  if (c.uid) {
    const acct = escUrl(homeUrl(c, "/account/"));
    return styles(c) + '<div class="fppm-wrap"><div class="fppm-card">You are already signed in. Head to your <a href="' + acct + '">dashboard</a>.</div></div>';
  }
  const def = Object.prototype.hasOwnProperty.call(TYPES, a.default) ? a.default : "fan";
  const old = c.regOld ?? {};
  const err = c.regErr ?? "";
  const type = truthy(old.fppm_type) && Object.prototype.hasOwnProperty.call(TYPES, old.fppm_type) ? old.fppm_type : def;
  const v = (k: string) => (old[k] !== undefined && old[k] !== null ? esc(old[k]) : "");
  const dues0 = esc(numberFormat(pricePlayerDues(c), 0)), sup0 = esc(numberFormat(priceSupporterMin(c), 0)), pct0 = esc(numberFormat(couponPercent(c), 0));
  let o = styles(c);
  o += T[0] + escUrl(assetUrl(c, "icon-192.png")) + T[1] + esc(teamName(c)) + T[2] + esc(teamCity(c)) + T[3] + esc(joinIntro(c)) + T[4] + dues0 + T[5] + sup0 + T[6] + pct0
    + T[7] + esc(collective(c)) + T[8] + nextEventPublicHtml(c) + T[9] + (await tickerHtml(c)) + T[10] + merchTeaserHtml(c) + T[11];
  if (truthy(err)) o += T[12] + esc(err) + T[13];
  o += T[14] + nonceField(c, "fppm_register", "fppm_register_nonce") + T[15] + esc(type) + T[16];
  const g = googleButton(c);
  if (g) o += T[17] + g + T[18];
  o += T[19] + dues0 + T[20] + sup0 + T[21] + v("fppm_first") + T[22] + v("fppm_last") + T[23] + v("fppm_email") + T[24] + v("fppm_phone") + T[25] + v("fppm_address")
    + T[26] + (truthy(v("fppm_city")) ? v("fppm_city") : "Fort Pierce") + T[27] + (truthy(v("fppm_state")) ? v("fppm_state") : "FL") + T[28] + v("fppm_zip") + T[29] + v("fppm_dob") + T[30];
  for (const [abbr, full] of POSITIONS) o += T[31] + esc(abbr) + T[32] + selected(old.fppm_position !== undefined ? old.fppm_position : "", abbr) + T[33] + esc(abbr + " — " + full) + T[34];
  o += T[35] + v("fppm_jersey") + T[36] + v("fppm_ec_name") + T[37] + v("fppm_ec_phone") + T[38] + esc(numberFormat(pricePlayerDues(c), 2)) + T[39];
  for (const sz of SHIRT_SIZES) o += T[40] + esc(sz) + T[41] + selected(old.fppm_shirt !== undefined ? old.fppm_shirt : "", sz) + T[42] + esc(sz) + T[43];
  o += T[44] + sup0 + T[45] + esc(phpNum(priceSupporterMin(c))) + T[46] + (truthy(v("fppm_contribution")) ? v("fppm_contribution") : esc(phpNum(priceSupporterMin(c))))
    + T[47] + esc(numberFormat(priceSupporterMin(c), 2)) + T[48] + pct0 + T[49] + esc(waiverVersion(c)) + T[50] + esc(waiverText(c)) + T[51] + checked(truthy(old.fppm_waiver_accept))
    + T[52] + esc(oathText(c)) + T[53] + checked(truthy(old.fppm_oath_accept)) + T[54] + escUrl(loginUrl(homeUrl(c, "/account/"))) + T[55];
  return o;
}

/** fppm_maybe_handle_register(): a join form posted to its page. A refusal refills the form; success → sign-in. */
export async function maybeHandleRegister(c: AjaxCtx): Promise<RedirectReply | null> {
  if (str(c.post.fppm_action) === "" || c.post.fppm_action !== "register") return null;
  if (c.uid) return null;
  const fail = (msg: string) => {
    c.regErr = msg;
    c.regOld = Object.fromEntries(Object.entries(c.post).map(([k, x]) => [k, typeof x === "string" ? sanitizeTextField(x) : ""]));
    return null;
  };
  if (c.post.fppm_register_nonce === undefined) return fail("Security check failed — please try again.");
  if (truthy(c.post.fppm_website)) return fail("Registration blocked.");
  const p = (k: string) => (c.post[k] !== undefined ? sanitizeTextField(str(c.post[k])) : "");
  let type = c.post.fppm_type !== undefined ? sanitizeKey(str(c.post.fppm_type)) : "fan";
  if (!Object.prototype.hasOwnProperty.call(TYPES, type)) type = "fan";
  const first = p("fppm_first"), last = p("fppm_last");
  const email = c.post.fppm_email !== undefined ? sanitizeEmail(str(c.post.fppm_email)) : "";
  const phone = p("fppm_phone"), addr = p("fppm_address"), city = p("fppm_city"), state = asciiUpper(p("fppm_state")), zip = p("fppm_zip");
  if (first === "" || last === "") return fail("Please enter your first and last name.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");
  if (phone === "") return fail("Please enter a phone number.");
  if (addr === "" || city === "" || state === "" || zip === "") return fail("Please enter your full mailing address (street, city, state and ZIP).");
  if (!truthy(c.post.fppm_waiver_accept)) return fail("You must read and accept the liability waiver to register.");
  if (!truthy(c.post.fppm_oath_accept)) return fail("You must take the Purple Martins oath to join.");
  if (await emailExists(c, email)) return fail("An account with that email already exists — please sign in instead.");

  let base = sanitizeUser(email.split("@")[0], true);
  if (base === "") base = "martin";
  let username = base;
  for (let i = 1; await usernameExists(c, username); i++) username = base + i;
  const uid = await insertUser(c, { user_login: username, user_email: email, first_name: first, last_name: last, display_name: (first + " " + last).trim(), role: "fppm_member" });
  if (isWPError(uid)) return fail("Could not create your account: " + uid.message);

  await setMeta(c, uid, "fppm_type", type);
  await setMeta(c, uid, "fppm_phone", phone);
  await setMeta(c, uid, "fppm_address", addr);
  await setMeta(c, uid, "fppm_city", city);
  await setMeta(c, uid, "fppm_state", state);
  await setMeta(c, uid, "fppm_zip", zip);
  await setMeta(c, uid, "fppm_optin", truthy(c.post.fppm_optin) ? 1 : 0);
  await setMeta(c, uid, "fppm_joined", currentMysql(c));
  await assignMemberCode(c, uid, first, last);

  // The liability waiver's acceptance record (the legal signature), exactly as the plugin kept it.
  const ip = sanitizeTextField(c.ip);
  const ua = sanitizeTextField(c.ua ?? "").slice(0, 300);
  await setMeta(c, uid, "fppm_waiver", { accepted: 1, version: waiverVersion(c), hash: waiverHash(c), at: currentMysql(c), ip, ua, name: (first + " " + last).trim(), email });
  await setMeta(c, uid, "fppm_oath", { accepted: 1, at: currentMysql(c), text: oathText(c) });

  if (type === "player") {
    await setMeta(c, uid, "fppm_player_status", "trialist");
    await setMeta(c, uid, "fppm_dob", p("fppm_dob"));
    const pos = p("fppm_position");
    if (POSITIONS.some(([k]) => k === pos)) await setMeta(c, uid, "fppm_position", pos);
    await setMeta(c, uid, "fppm_jersey", c.post.fppm_jersey !== undefined ? str(c.post.fppm_jersey).replace(/[^0-9]/g, "") : "");
    await setMeta(c, uid, "fppm_ec_name", p("fppm_ec_name"));
    await setMeta(c, uid, "fppm_ec_phone", p("fppm_ec_phone"));
    await duesAdd(c, uid, pricePlayerDues(c), "Player dues");
  } else if (type === "supporter") {
    const shirt = p("fppm_shirt");
    if (SHIRT_SIZES.includes(shirt)) await setMeta(c, uid, "fppm_shirt", shirt);
    let contrib = c.post.fppm_contribution !== undefined ? phpFloat(str(c.post.fppm_contribution)) : priceSupporterMin(c);
    if (contrib < priceSupporterMin(c)) contrib = priceSupporterMin(c);
    await setMeta(c, uid, "fppm_contribution", numberFormat(contrib, 2).replace(/,/g, ""));
    await duesAdd(c, uid, contrib, "Supporter contribution (incl. tee + " + numberFormat(couponPercent(c), 0) + "% merch code)");
  }

  const to = notifyEmail(c);
  if (truthy(to)) {
    const subj = "[FPPM] New " + typeLabel(type) + " — " + (first + " " + last).trim();
    let body = "New registration:\n\nName: " + first + " " + last + "\nType: " + typeLabel(type) + "\nEmail: " + email + "\nPhone: " + phone + "\nAddress: " + addr + ", " + city + ", " + state + " " + zip + "\n";
    body += "Waiver: accepted v" + waiverVersion(c) + " (" + ip + ")\n";
    await sendMail(c.env, to, subj, body);
  }
  await waiverRecordOffsite(c, uid);
  // Intended difference: the plugin signed the new member in here; they prove the address is theirs first.
  return new RedirectReply(loginUrl(addQueryArg({ fppm_note: "registered" }, homeUrl(c, "/account/"))));
}
