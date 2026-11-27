/** The render parity cases: plugin expressions and their Worker ports. */
import type { Ctx } from "../src/ctx";
import * as H from "../src/render/home";
import * as K from "../src/forms/catalog";
import { alert } from "../src/forms/express";
import * as AC from "../src/render/account";
import { gardenInvite } from "../src/render/garden";
import { start } from "../src/forms/consent";
import { meta } from "../src/ctx";
import { timelapse } from "../src/aerial/shortcode";
import { restDispatch } from "../src/aerial/rest";
import { onLogin } from "../src/aerial/checker";
import * as ATA from "../src/aerial/admin";
import { phpJson } from "../src/php";

export interface Case {
  name: string;
  uid?: number;
  permalink?: string;
  options?: Record<string, unknown>;
  meta?: [number, string, unknown][];
  php: string[];
  ts: ((c: Ctx) => Promise<string> | string)[];
  checkAssets?: boolean;
  /** An intended difference (MIGRATION.md): how the Worker's output differs from the plugin's, applied to the plugin's. */
  intended?: (phpOut: string) => string;
}

/** PHP: set $gff_reg_state fields first (a failed submit's notice and refill values). */
const state = (php: string) => `((function(){ global $gff_reg_state; ${php} })() ?? '')`;
const people = [0, 1, 4, 29, 30];
const nasty = "Tom & \"Jerry\" <b>'s</b> &amp;";

type Meta = [number, string, unknown][];
/** Intended difference 9 (MIGRATION.md): the account page's guest view says "Sign in", and how. */
const guestSignIn = (o: string) => {
  const btn = ">Log in with WordPress</a>";
  const hint = /<p class="gff-acct__hint">Prefer Google\? Use the Google button on the <a href="[^"]*">login page<\/a>\.<\/p>/;
  if (!o.includes(btn)) return o;
  if (!hint.test(o)) throw new Error("the guest hint moved: update the intended difference");
  return o.replace(btn, ">" + AC.GUEST_BUTTON + "</a>").replace(hint, '<p class="gff-acct__hint">' + AC.GUEST_HINT + "</p>");
};
/** Account states, by user meta (users 18 and 24 are customers, 29 a lead). */
const ACCOUNT_STATES: [string, number, Meta][] = [
  ["sunrise, locked", 24, [[24, "gff_offer", "sunrise"]]],
  ["sunrise, unlock pending", 24, [[24, "gff_offer", "sunrise"], [24, "gff_spire_unlock_request", { channel: "invoice", time: "2026-11-02 09:30:00", status: "invoice_requested" }]]],
  ["sunrise, paypal started", 24, [[24, "gff_offer", "sunrise"], [24, "gff_spire_unlock_request", { channel: "paypal", time: "2026-10-31 18:00:00", status: "paypal_clicked" }]]],
  ["sunrise, unlocked", 24, [[24, "gff_offer", "sunrise"], [24, "gff_spire_unlocked", "yes"]]],
  ["sunrise, spires requested", 24, [[24, "gff_offer", "sunrise"], [24, "gff_spire_unlocked", "yes"], [24, "gff_spire_addon_request", { qty: 1, monthly: 100, time: "2026-11-10 10:00:00", status: "requested" }]]],
  ["spire, towers", 18, [[18, "gff_offer", "spire"], [18, "first_name", "Rae <b>"], [18, "gff_farm_layout", JSON.stringify({ offer: "spire", towers: [{ tower: 1, plants: ["Kale", "Unknown plant"] }, { tower: 2, plants: [] }] })]]],
  ["spire, sisters requested", 18, [[18, "gff_tower_qty", "2"], [18, "gff_three_sisters_request", { time: "2026-09-01 12:00:00", status: "requested" }]]],
  ["seasonal bed + moringa + add-ons", 29, [[29, "gff_farm_layout", JSON.stringify({ offer: "both", seasonal_spots: ["Okra", "Zinnia"] })], [29, "gff_moringa_fruit_upgrade", "yes"],
    [29, "gff_addons", ["starfruit", "bogus", "headstart"]], [29, "gff_addons_notes", "Two more trees\nand a bench <b>"]]],
  ["crops only", 29, [[29, "gff_crops_wanted", ["Basil", "Moringa", "Nope"]], [29, "gff_farm_layout", ""], [29, "first_name", ""]]],
  ["nothing chosen", 29, [[29, "gff_crops_wanted", "x"], [29, "gff_farm_layout", "not json"], [29, "gff_offer", "lawn"], [29, "gff_signup_flow", ""]]],
];
/** Forms posted to the account page. */
const POSTS: [string, number, Meta, Record<string, string>][] = [
  ["empty message", 24, [], { gff_acct_msg_nonce: "x", gff_acct_message: "  " }],
  ["message", 24, [[24, "gff_phone", "772-555-0101"]], { gff_acct_msg_nonce: "x", gff_acct_message: "Hi <b>there</b>\nCan you come Tuesday?\r\nThanks" }],
  ["unlock invoice", 24, [[24, "gff_offer", "sunrise"]], { gff_spire_unlock_nonce: "x", gff_spire_unlock_action: "invoice" }],
  ["unlock paypal beacon", 24, [[24, "gff_offer", "sunrise"]], { gff_spire_unlock_nonce: "x", gff_spire_unlock_action: "paypal" }],
  ["unlock other", 24, [[24, "gff_offer", "sunrise"]], { gff_spire_unlock_nonce: "x", gff_spire_unlock_action: "free" }],
  ["spires requested", 24, [[24, "gff_offer", "sunrise"], [24, "gff_spire_unlocked", "yes"]], { gff_spire_req_nonce: "x", gff_spire_req_qty: "40" }],
  ["spires while locked", 24, [[24, "gff_offer", "sunrise"]], { gff_spire_req_nonce: "x", gff_spire_req_qty: "2" }],
  ["three sisters", 18, [[18, "gff_offer", "spire"]], { gff_three_sisters_nonce: "x", gff_three_sisters_action: "request" }],
  ["three sisters wrong action", 18, [[18, "gff_offer", "spire"]], { gff_three_sisters_nonce: "x", gff_three_sisters_action: "maybe" }],
  ["planner save", 29, [], { gff_planner_nonce: "x", gff_farm_layout: JSON.stringify({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Mint", "Dill"] }] }) }],
  ["planner save empty", 29, [], { gff_planner_nonce: "x", gff_farm_layout: JSON.stringify({ offer: "sunrise", seasonal_spots: [] }) }],
];
const AFTER_KEYS = ["gff_acct_messages", "gff_spire_unlock_request", "gff_spire_addon_request", "gff_three_sisters_request", "gff_farm_layout", "gff_offer", "gff_crops_wanted"];
/** A PHP array literal of a flat string map. */
const phpArr = (o: Record<string, string>) => "[" + Object.entries(o).map(([k, v]) => `${JSON.stringify(k)} => ${JSON.stringify(v).replace(/\$/g, "\\$")}`).join(", ") + "]";
const phpPost = (post: Record<string, string>) => `((function(){ $_POST = ${phpArr(post)}; })() ?? '')`;
const withPost = (post: Record<string, string>) => (c: Ctx) => { Object.assign(c, { post }); return ""; };
const TOKEN_OK: Meta = [[27, "gff_garden_token", "d4f6d0e41a60b9d5ee905ef0099f5230"], [27, "gff_garden_token_exp", String(1795176000 + 3600)]];
/** The garden page: its link (?g, ?t), the stored token, and a posted garden. */
const GARDEN: [string, Record<string, string>, Meta, Record<string, string>][] = [
  ["no link", {}, [], {}],
  ["wrong token", { g: "27", t: "nope" }, TOKEN_OK, {}],
  ["expired", { g: "27", t: "goodtoken" }, [[27, "gff_garden_token", "d4f6d0e41a60b9d5ee905ef0099f5230"], [27, "gff_garden_token_exp", "1795170000"]], {}],
  ["valid", { g: "27", t: "goodtoken" }, TOKEN_OK, {}],
  ["valid, both mode", { g: "27", t: "goodtoken" }, [...TOKEN_OK, [27, "gff_offer", ""], [27, "gff_farm_layout", ""], [27, "gff_signup_flow", ""]], {}],
  ["save", { g: "27", t: "goodtoken" }, TOKEN_OK, { gff_garden_nonce: "x", gff_farm_layout: JSON.stringify({ offer: "sunrise", seasonal_spots: ["Kale", "Okra <i>"] }) }],
  ["save nothing", { g: "27", t: "goodtoken" }, TOKEN_OK, { gff_garden_nonce: "x", gff_farm_layout: "" }],
];

/* ---- Aerial Timelapse: users 1 and 33 have a saved property ---- */
/** After a step: the at_property records and the last bulk-check record, as stored. */
const AT_STATE_PHP = ["json_encode([get_user_meta(1, 'at_property', true), get_user_meta(33, 'at_property', true), get_user_meta(4, 'at_property', true), get_option('at_last_check')], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)"];
const AT_STATE_TS = [async (c: Ctx) => JSON.stringify([await meta(c, 1, "at_property"), await meta(c, 33, "at_property"), await meta(c, 4, "at_property"), c.opts.at_last_check ?? false])];
/** One REST request on both sides, then the stored state. */
const rest = (name: string, uid: number, method: string, route: string, params: Record<string, string> = {}, headers: Record<string, string> = {}, metas: Meta = []): Case => ({
  name: "aerial rest " + name, uid, meta: metas,
  php: [`test_rest_dispatch(${JSON.stringify(method)}, ${JSON.stringify("/aerial-timelapse/v1" + route)}, ${phpArr(params)}, ${phpArr(headers)})`, ...AT_STATE_PHP],
  ts: [async (c: Ctx) => JSON.stringify(await restDispatch(c, method, "/aerial-timelapse/v1" + route, params, headers)), ...AT_STATE_TS],
});
const GLOW = (expiry: string) => [[1, "at_property", { address: "4609 MAGNOLIA DR, FORT PIERCE, FL, 34982", lat: 27.380588264534, lng: -80.312276220892,
  frames: [{ item_id: "fl_m_2708038_sw_17_1_20100617", date: "2010-06-17", url: "https://example.test/a.png" }], latest_item_id: "fl_m_2708038_sw_17_1_20100617",
  last_checked_at: "2026-11-01T00:00:00+00:00", last_updated_at: "2026-11-01T00:00:00+00:00", is_new_update: true, new_update_expiry: expiry }]] as Meta;
const BILLING: Meta = [[4, "billing_address_1", " 9 Palm Ct "], [4, "billing_city", "Fort Pierce"], [4, "billing_state", "FL"], [4, "billing_postcode", ""]];
const AERIAL: Case[] = [
  { name: "aerial shortcode assets", uid: 1, php: ["run_hook('wp_enqueue_scripts')", "do_shortcode('[aerial_timelapse]')"], ts: [(c) => { H.registerAssets(c); return ""; }, (c) => timelapse(c)], checkAssets: true },
  ...[0, 1, 4, 33].map((uid) => ({ name: `aerial shortcode u${uid}`, uid, php: [`do_shortcode('[aerial_timelapse]')`, `do_shortcode('[aerial_timelapse user_id="33" editable="no"]')`, `do_shortcode('[aerial_timelapse user_id="x" editable="maybe"]')`],
    ts: [(c: Ctx) => timelapse(c), (c: Ctx) => timelapse(c, { user_id: "33", editable: "no" }), (c: Ctx) => timelapse(c, { user_id: "x", editable: "maybe" })] })),
  rest("get signed out", 0, "GET", "/property"),
  rest("get own", 1, "GET", "/property"),
  rest("get none, no billing", 4, "GET", "/property"),
  rest("get none, billing", 4, "GET", "/property", {}, {}, BILLING),
  rest("get other, not staff", 4, "GET", "/property", { user_id: "1" }),
  rest("get other, admin", 1, "GET", "/property", { user_id: "33" }),
  rest("get user_id 0", 1, "GET", "/property", { user_id: "0" }),
  rest("get bad user_id", 0, "GET", "/property", { user_id: "abc" }),
  rest("get glow expired", 1, "GET", "/property", {}, {}, GLOW("2026-11-19T00:00:00+00:00")),
  rest("get glow active", 1, "GET", "/property", {}, {}, GLOW("2026-12-15T00:00:00+00:00")),
  rest("post missing address", 0, "POST", "/property"),
  rest("post signed out", 0, "POST", "/property", { address: "10 Grove Rd" }),
  rest("post not found", 4, "POST", "/property", { address: "Nowhere 1" }),
  rest("post geocoder down", 4, "POST", "/property", { address: "boom" }),
  rest("post build", 4, "POST", "/property", { address: " 10 <b>Grove</b> Rd, Fort Pierce " }),
  rest("post rebuild own", 1, "POST", "/property", { address: "10 Grove Rd" }),
  rest("post no imagery", 4, "POST", "/property", { address: "20 Bare Ln" }),
  rest("post catalog down", 4, "POST", "/property", { address: "30 Down St" }),
  rest("unknown method", 1, "DELETE", "/property"),
  rest("unknown route", 1, "GET", "/nope"),
  rest("check signed out", 0, "GET", "/check-updates"),
  rest("check wrong token", 4, "GET", "/check-updates", { token: "nope" }),
  rest("check token", 0, "GET", "/check-updates", { token: "test-at-token" }),
  rest("check header token", 0, "POST", "/check-updates", {}, { "X-AT-Token": "test-at-token" }),
  rest("check admin", 1, "POST", "/check-updates"),
  rest("check with a failing catalog", 1, "GET", "/check-updates", {}, {}, [[33, "at_property", { address: "x", lat: 24.1, lng: -81, frames: [], latest_item_id: "", last_checked_at: "", last_updated_at: "", is_new_update: false, new_update_expiry: null }]]),
  // Sign-in: the first schedules the weekly window (staggered by signup date); a due one checks; a future one waits.
  ...[["first", []], ["due", [[1, "at_property", { ...GLOW("2026-11-19T00:00:00+00:00")[0][2] as object, next_check_due: 1795176000 - 10 }]]], ["not due", [[1, "at_property", { ...GLOW("2026-11-19T00:00:00+00:00")[0][2] as object, next_check_due: 1795176000 + 99 }]]]].map(([n, m]) => ({
    name: "aerial login " + n, uid: 1, meta: m as Meta,
    php: ["run_hook('wp_login', 'martingawlak@gmail.com', new WP_User(get_userdata(1)))", "run_hook('wp_login', 'x', new WP_User(get_userdata(33)))", "run_hook('wp_login', 'x', new WP_User(get_userdata(4)))", ...AT_STATE_PHP],
    ts: [async (c: Ctx) => { await onLogin(c, 1); return ""; }, async (c: Ctx) => { await onLogin(c, 33); return ""; }, async (c: Ctx) => { await onLogin(c, 4); return ""; }, ...AT_STATE_TS],
  })),
  // Settings → Aerial Timelapse (the WP-CLI block is gone: intended difference 10).
  { name: "aerial settings, never run", uid: 1, permalink: "/wp-admin/options-general.php?page=aerial-timelapse", php: ["((function(){ AT_Admin::settings_page(); })() ?? '')"], ts: [ATA.settingsPage], intended: noCli },
  { name: "aerial settings, last run", uid: 1, permalink: "/wp-admin/options-general.php?page=aerial-timelapse", options: { at_last_check: { time: "2026-11-01T00:00:00+00:00", checked: 2, updated: 1, errors: ["user 3: <oops>", "b"] } },
    php: ["((function(){ AT_Admin::settings_page(); })() ?? '')"], ts: [ATA.settingsPage], intended: noCli },
  { name: "aerial settings, run now", uid: 1, permalink: "/wp-admin/options-general.php?page=aerial-timelapse&at_run_check=1",
    php: ["((function(){ $_GET = ['page' => 'aerial-timelapse', 'at_run_check' => '1']; AT_Admin::settings_page(); })() ?? '')", ...AT_STATE_PHP],
    ts: [(c) => { Object.assign(c, { get: { page: "aerial-timelapse", at_run_check: "1" } }); return ATA.settingsPage(c); }, ...AT_STATE_TS], intended: noCli },
  // The profile section and its save.
  { name: "aerial profile fields", uid: 1, php: ["((function(){ AT_Admin::profile_fields(new WP_User(get_userdata(33))); AT_Admin::profile_fields(new WP_User(get_userdata(4))); })() ?? '')"],
    ts: [async (c) => (await ATA.profileFields(c, (await import("../src/ctx")).loadUser ? (await (await import("../src/ctx")).loadUser(c.env, 33))! : null!)) + (await ATA.profileFields(c, (await (await import("../src/ctx")).loadUser(c.env, 4))!))] },
  { name: "aerial profile fields, not allowed", uid: 4, php: ["((function(){ AT_Admin::profile_fields(new WP_User(get_userdata(1))); AT_Admin::profile_fields(new WP_User(get_userdata(4))); })() ?? '')"],
    ts: [async (c) => (await ATA.profileFields(c, (await (await import("../src/ctx")).loadUser(c.env, 1))!)) + (await ATA.profileFields(c, (await (await import("../src/ctx")).loadUser(c.env, 4))!))] },
  ...([["unchanged", 1, 1, { at_address: "4609 magnolia dr, fort pierce, fl, 34982" }], ["rebuild", 1, 33, { at_address: "10 Grove Rd" }], ["clear", 1, 1, { at_address: "" }],
    ["fails", 1, 4, { at_address: "Nowhere" }], ["not allowed", 4, 1, { at_address: "" }], ["own", 4, 4, { at_address: "10 Grove" }], ["no field", 1, 1, {}]] as [string, number, number, Record<string, string>][]).map(([n, uid, who, post]) => ({
    name: "aerial profile save " + n, uid,
    php: [`((function(){ $_POST = ${phpArr(post)}; AT_Admin::save_profile(${who}); AT_Admin::notices(); AT_Admin::notices(); })() ?? '')`, ...AT_STATE_PHP],
    ts: [async (c: Ctx) => { await ATA.saveProfile(c, who, post); return (await ATA.notices(c)) + (await ATA.notices(c)); }, ...AT_STATE_TS],
  })),
];
/** Intended difference 10 (MIGRATION.md): no WP-CLI block on the Worker's settings page. */
function noCli(o: string): string {
  const re = /\t\t\t<h2>Option B — WP-CLI<\/h2>\n\t\t\t<pre><code>cd [^<]* && wp aerial-timelapse check<\/code><\/pre>\n/;
  if (!o.includes("<h1>Aerial Timelapse — update checks</h1>")) return o;
  if (!re.test(o)) throw new Error("the WP-CLI block moved: update the intended difference");
  return o.replace(re, "");
}

export const CASES: Case[] = [
  { name: "assets", php: ["run_hook('wp_enqueue_scripts')"], ts: [(c) => { H.registerAssets(c); return ""; }], checkAssets: true },
  { name: "css and js", php: ["gff_reg_css()", "gff_reg_font_overrides()", "gff_reg_validation_js()"], ts: [H.regCss, H.fontOverrides, H.validationJs] },
  ...people.map((uid) => ({ name: `zora display u${uid}`, uid, php: ["do_shortcode('[gff_zora_display]')"], ts: [(c: Ctx) => H.zoraDisplay(c)] })),
  // The express form: opens once, closes once; the notice prints at the start and at the end.
  ...people.map((uid) => ({
    name: `express form u${uid}`, uid,
    php: ["gff_sc_express_start()", "gff_sc_express_start()", "gff_sc_express_email()", "gff_sc_consult()", "gff_sc_agreement()", "gff_sc_express_submit()", "gff_sc_form_end()", "gff_sc_form_end()"],
    ts: [H.expressStart, H.expressStart, H.expressEmail, H.consult, H.agreement, H.expressSubmit, H.formEnd, H.formEnd],
  })),
  {
    name: "express form after a failed submit",
    php: [state("$gff_reg_state['notice'] = '<div id=\"gff-alert\">x</div>'; $gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_express_email' => " + JSON.stringify(nasty).replace(/\$/g, "\\$") + ", 'gff_agree' => 'yes'];"),
      "gff_sc_express_start()", "gff_sc_express_email()", "gff_sc_agreement()", "gff_sc_form_end()"],
    ts: [(c) => { c.reg.notice = '<div id="gff-alert">x</div>'; c.reg.repop = true; c.reg.old = { gff_express_email: nasty, gff_agree: "yes" }; return ""; },
      H.expressStart, H.expressEmail, H.agreement, H.formEnd],
  },
  {
    name: "refill edge cases",
    php: [state("$gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_express_email' => '0', 'gff_agree' => ['yes']];"), "gff_sc_express_email()", "gff_sc_agreement()",
      state("$gff_reg_state['repop'] = false; $gff_reg_state['old'] = ['gff_express_email' => 'a@b.co', 'gff_agree' => 'yes'];"), "gff_sc_express_email()", "gff_sc_agreement()",
      state("$gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_agree' => 'no'];"), "gff_sc_agreement()"],
    ts: [(c) => { c.reg.repop = true; c.reg.old = { gff_express_email: "0", gff_agree: ["yes"] }; return ""; }, H.expressEmail, H.agreement,
      (c) => { c.reg.repop = false; c.reg.old = { gff_express_email: "a@b.co", gff_agree: "yes" }; return ""; }, H.expressEmail, H.agreement,
      (c) => { c.reg.repop = true; c.reg.old = { gff_agree: "no" }; return ""; }, H.agreement],
  },
  {
    name: "shortcode attributes",
    php: [`do_shortcode('[gff_express_email legend="Hold it" label="Email please"]')`, `do_shortcode('[gff_consult legend="A & B"]')`, `do_shortcode('[gff_express_submit label="Go <now>"]')`,
      `do_shortcode('[gff_convince]')`, `do_shortcode('[gff_convince open="YES" label="Why?"]')`, `do_shortcode('[gff_convince open="no"]')`],
    ts: [(c) => H.expressEmail(c, { legend: "Hold it", label: "Email please" }), (c) => H.consult(c, { legend: "A & B" }), (c) => H.expressSubmit(c, { label: "Go <now>" }),
      (c) => H.convince(c), (c) => H.convince(c, { open: "YES", label: "Why?" }), (c) => H.convince(c, { open: "no" })],
  },
  {
    name: "catalogues and prices",
    php: ["gff_reg_crops()", "gff_reg_addons()", "gff_reg_bundle()", "gff_v33_offers()", "gff_reg_agreement_version()", "gff_reg_consult_amount()",
      "gff_reg_reservation_meta('consult')", "gff_reg_reservation_meta('down_payment')", "gff_reg_reservation_meta('workshop')", "gff_reg_reservation_meta('none')", "gff_reg_reservation_meta('x')",
      "gff_reg_paypal_payment_url()", "gff_reg_paypal_payment_url('250')"],
    ts: [() => JSON.stringify(K.crops()), () => JSON.stringify(K.addons()), () => JSON.stringify(K.bundle()), () => JSON.stringify(K.offers()), K.agreementVersion, K.consultAmount,
      ...["consult", "down_payment", "workshop", "none", "x"].map((o) => (c: Ctx) => JSON.stringify(K.reservationMeta(c, o))),
      (c) => K.paypalPaymentUrl(c), (c) => K.paypalPaymentUrl(c, "250")],
  },
  {
    name: "paypal.me link", options: { gff_reg_paypal_link: "https://www.paypal.me/gawlak/ x" },
    php: ["gff_reg_paypal_link()", "gff_reg_paypal_payment_url('25 0')", "gff_reg_reservation_meta('down_payment')"],
    ts: [K.paypalLink, (c) => K.paypalPaymentUrl(c, "25 0"), (c) => JSON.stringify(K.reservationMeta(c, "down_payment"))],
  },
  { name: "alerts", php: ["gff_reg_alert('success', '<b>ok</b>')", "gff_reg_alert('error', 'x')", "gff_reg_alert('other', '')"], ts: [() => alert("success", "<b>ok</b>"), () => alert("error", "x"), () => alert("other", "")] },
  {
    name: "referer field from the request", permalink: "/start/?utm=a+b&_wp_http_referer=x&k=%7Esq&flag",
    php: ["gff_sc_express_start()"], ts: [H.expressStart],
  },
  { name: "three sisters", php: ["gff_reg_three_sisters_field()", "gff_reg_three_sisters_field(true)"], ts: [() => H.threeSistersField(), () => H.threeSistersField(true)] },

  /* ---- The account page ---- */
  ...[0, 4, 18, 24, 27, 28, 29].map((uid) => ({ name: `account u${uid}`, uid, php: ["gff_sc_account()"], ts: [AC.account], intended: guestSignIn })),
  ...ACCOUNT_STATES.map(([name, uid, metas]) => ({ name: "my farm " + name, uid, meta: metas, php: ["gff_sc_my_farm()", "gff_sc_account_planner()"], ts: [AC.myFarm, AC.accountPlanner] })),
  ...POSTS.map(([name, uid, metas, post]) => ({
    name: "account post " + name, uid, meta: metas,
    php: [phpPost(post), "gff_sc_account()", "json_encode($GLOBALS['MAIL'])", ...AFTER_KEYS.map((k) => `json_encode(get_user_meta(${uid}, '${k}', true))`)],
    ts: [withPost(post), AC.account, (c: Ctx) => phpJson(c.env.MAIL_LOG), ...AFTER_KEYS.map((k) => async (c: Ctx) => phpJson(await meta(c, uid, k)))],
  })),
  { name: "my farm signed out", php: ["gff_sc_my_farm()", "gff_sc_account_planner()"], ts: [AC.myFarm, AC.accountPlanner] },
  {
    name: "farm builder", uid: 27,
    php: ["gff_sc_farm_builder()", "do_shortcode('[gff_farm_builder mode=\"spire\"]')", "do_shortcode('[gff_farm_builder mode=\"sunrise\" user=\"current\"]')", "do_shortcode('[gff_farm_builder user=\"28\"]')", "do_shortcode('[gff_farm_builder user=\"-3\"]')"],
    ts: [(c) => AC.farmBuilder(c), (c) => AC.farmBuilder(c, { mode: "spire" }), (c) => AC.farmBuilder(c, { mode: "sunrise", user: "current" }), (c) => AC.farmBuilder(c, { user: "28" }), (c) => AC.farmBuilder(c, { user: "-3" })],
  },
  {
    name: "farm builder preload", uid: 18, meta: [[18, "gff_farm_layout", JSON.stringify({ offer: "", towers: [{ tower: 1, plants: ["Kale / x"] }] })], [18, "gff_tower_qty", "3"], [18, "gff_moringa_fruit_upgrade", "yes"]],
    php: ["do_shortcode('[gff_farm_builder mode=\"spire\" user=\"current\"]')"], ts: [(c) => AC.farmBuilder(c, { mode: "spire", user: "current" })],
  },
  { name: "farm builder signed out", php: ["do_shortcode('[gff_farm_builder user=\"current\"]')"], ts: [(c) => AC.farmBuilder(c, { user: "current" })] },
  { name: "account styles", php: ["gff_acct_styles()"], ts: [AC.acctStyles] },
  { name: "helpers", php: ["gff_sunrise_spire_monthly(0)", "gff_sunrise_spire_monthly(3)", "gff_sunrise_spire_monthly(7)", "gff_reg_customer_offer(24)", "gff_reg_customer_offer(27)", "gff_reg_customer_offer(1)", "mysql2date('M j', '2026-03-05 23:59:00')"],
    ts: [() => String(AC.sunriseSpireMonthly(0)), () => String(AC.sunriseSpireMonthly(3)), () => String(AC.sunriseSpireMonthly(7)), (c) => AC.customerOffer(c, 24), (c) => AC.customerOffer(c, 27), (c) => AC.customerOffer(c, 1), () => AC.mysql2date("M j", "2026-03-05 23:59:00")] },

  /* ---- The garden page ---- */
  ...GARDEN.map(([name, get, metas, post]) => ({
    name: "garden " + name, meta: metas, permalink: "/garden/" + (Object.keys(get).length ? "?" + new URLSearchParams(get).toString() : ""),
    php: [`((function(){ $_GET = ${phpArr(get)}; $_POST = ${phpArr(post)}; })() ?? '')`, "gff_sc_garden_invite()", "json_encode($GLOBALS['MAIL'])", "json_encode(json_decode((string) get_user_meta(27, 'gff_farm_layout', true), true))"],
    ts: [(c: Ctx) => { Object.assign(c, { get, post }); return ""; }, (c: Ctx) => gardenInvite(c), (c: Ctx) => phpJson(c.env.MAIL_LOG), async (c: Ctx) => phpJson(await AC.metaJson(c, 27, "gff_farm_layout"))],
  })),

  /* ---- [gff_start] ---- */
  {
    name: "start", php: ["gff_sc_start()", `do_shortcode('[gff_start offer="both"]')`, `do_shortcode('[gff_start offer="lawn" label="Go & <b>" note="<em>Hi</em> &amp; bye"]')`],
    ts: [(c) => start(c), (c) => start(c, { offer: "both" }), (c) => start(c, { offer: "lawn", label: "Go & <b>", note: "<em>Hi</em> &amp; bye" })],
  },
  ...AERIAL,
];
