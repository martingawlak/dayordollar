/**
 * The render parity cases: plugin expressions (PHP) and their Worker ports
 * (TS), for every shortcode, dashboard and card, at the states that change
 * them. People: see test/fixture.php (1 admin, 2 staff, 3 fan, 4 player,
 * 5 supporter, 6 bare Google sign-in, 7 invited fan, 8 awkward player,
 * 9 active player).
 */
import type { Ctx } from "../src/ctx";
import type { Env } from "../src/env";
import { NOW } from "./harness";
import { googleButton, PASSWORD_FIELD, scRegister } from "../src/fppm/register";
import { apparelBlock, announcementsHtml, completeForm, installCard, inviteCard, memberDashboard, scAccount, scMerch, tickerHtml } from "../src/fppm/account";
import { staffDashboard } from "../src/fppm/staff";
import { calendarHtml, eventsGet, eventsUpcoming, eventWhen, gcalUrl, icsServe, nextEventPublicHtml, outlookUrl, scheduleMemberHtml, scheduleStaffHtml } from "../src/fppm/events";
import { completionGate, loginGate, type PageInfo } from "../src/fppm/gate";
import { manifestJson, pwaFooter, pwaHead, swJs } from "../src/fppm/pwa";
import { flashHtml, waiverHash, waiverText } from "../src/fppm/core";
import { merchTeaserHtml, storeCatalog } from "../src/fppm/store";

export interface Case {
  name: string;
  uid?: number;
  /** $_SERVER['REQUEST_URI'] (the page; wp_referer_field() prints it). */
  uri?: string;
  get?: Record<string, string>;
  now?: number;
  options?: Record<string, unknown>;
  meta?: [number, string, unknown][];
  /** Extra users [id, login, role] (both sides). */
  users?: [number, string, string][];
  /** The page viewed, for the gates: [post_name, post_content], or null for a 404. */
  queried?: [string, string] | null;
  env?: Partial<Env>;
  php: string[];
  ts: ((c: Ctx) => Promise<string> | string)[];
  /** Intended differences (MIGRATION.md), applied to the plugin's output first. */
  intended?: (phpOut: string, c: Ctx) => string;
}

/**
 * Intended differences in the join and sign-in markup: Nextend's Google button points at the
 * shared accounts sign-in (the stand-in prints a marker where Nextend's button went), and the
 * join form has no password field.
 */
const signIn = (o: string, c: Ctx) => o.split("<!--nsl-google-->").join(googleButton(c)).replace(PASSWORD_FIELD, "");

/** A streamed reply as the PHP half reports it: what it printed, then the exit with its headers. */
const exitJson = (headers: string[]) => JSON.stringify({ exit: true, headers });
async function streamed(r: Response): Promise<string> {
  const keep = ["Content-Type", "Content-Disposition", "Service-Worker-Allowed"];
  const h = keep.filter((k) => r.headers.get(k) !== null).map((k) => k + ": " + r.headers.get(k));
  return (await r.text()) + exitJson(h);
}
const SAT_0830 = NOW + 73800, SAT_0930 = SAT_0830 + 3600, SUN = SAT_0830 + 86400, MATCH_NIGHT = 1795894200 /* 2026-11-28 19:30 */ + 7200;
const phpArr = (o: Record<string, string>) => "[" + Object.entries(o).map(([k, v]) => `${JSON.stringify(k)} => ${JSON.stringify(v).replace(/\$/g, "\\$")}`).join(", ") + "]";
const OLD = { fppm_type: "player", fppm_first: "Ana \"A\" <b>", fppm_last: "O'Lee", fppm_email: "ana@example", fppm_phone: "", fppm_city: "", fppm_state: "fl", fppm_position: "CB",
  fppm_shirt: "XL", fppm_jersey: "7", fppm_contribution: "", fppm_waiver_accept: "1", fppm_oath_accept: "" };
const manyMembers = (): [number, string, string][] => Array.from({ length: 86 }, (_, i) => [100 + i, "m" + i, "fppm_member"]);
const PAGES: Record<string, [PageInfo | null, [string, string] | null]> = {
  front: [{ slug: "fort-pierce-purple-martins", shortcodes: ["fppm_register", "fppm_merch"] }, ["fort-pierce-purple-martins", "<p>[fppm_register]</p>\n[fppm_merch]"]],
  go: [{ slug: "go", shortcodes: ["fppm_register"] }, ["go", "[fppm_register]"]],
  account: [{ slug: "account", shortcodes: ["fppm_account"] }, ["account", "[fppm_account]"]],
  roster: [{ slug: "roster", shortcodes: [] }, ["roster", "<h2>Fall 2027</h2>"]],
  privacy: [{ slug: "privacy-policy", shortcodes: [] }, ["privacy-policy", "x"]],
  notfound: [null, null],
};
const gatePhp = "((function(){ try { fppm_login_gate(); fppm_completion_gate(); return ''; } catch (JsonReply $r) { return json_encode($r->body, JSON_UNESCAPED_SLASHES); } })())";
const gateTs = (page: PageInfo | null) => async (c: Ctx) => { const to = loginGate(c, page) ?? (await completionGate(c, page)); return to ? JSON.stringify({ redirect: to }).replace(/\\\//g, "/") : ""; };
const gate = (name: string, key: string, uid = 0, extra: Partial<Case> = {}): Case =>
  ({ name: "gate: " + name, uid, queried: PAGES[key][1], php: [gatePhp], ts: [gateTs(PAGES[key][0])], ...extra });

const account = (name: string, uid: number, extra: Partial<Case> = {}): Case =>
  ({ name: "account: " + name, uid, uri: "/account/", php: ["fppm_sc_account()"], ts: [scAccount], intended: signIn, ...extra });

export const CASES: Case[] = [
  /* The join form */
  { name: "join form, signed out", uri: "/go/", php: ["fppm_sc_register()"], ts: [(c) => scRegister(c)], intended: signIn },
  { name: "join form on the front page, then [fppm_merch] (styles once)", uri: "/", php: ["fppm_sc_register()", "fppm_sc_merch()"], ts: [(c) => scRegister(c), scMerch], intended: signIn },
  { name: "join form, refilled after a refusal", uri: "/go/?x=1&_wp_http_referer=/a",
    php: [`((function(){ $GLOBALS['fppm_reg_err'] = 'You must take the Purple Martins oath to join.'; $GLOBALS['fppm_reg_old'] = ${phpArr(OLD)}; return fppm_sc_register(); })())`],
    ts: [(c) => { c.regErr = "You must take the Purple Martins oath to join."; c.regOld = OLD; return scRegister(c); }], intended: signIn },
  { name: "join form via [fppm_invite]", uri: "/invite/", php: ["fppm_sc_invite()"], ts: [(c) => scRegister(c, { default: "fan" })], intended: signIn },
  { name: "join form, signed in", uid: 3, php: ["fppm_sc_register()"], ts: [(c) => scRegister(c)] },
  { name: "join form, custom texts and prices", uri: "/go/", php: ["fppm_sc_register()"], ts: [(c) => scRegister(c)], intended: signIn,
    options: { fppm_join_intro: "Join <us> & \"win\"", fppm_collective: "Martin Army", fppm_price_player_dues: "12.5", fppm_price_supporter_min: "30", fppm_coupon_percent: "15.5",
      fppm_waiver_text: "Short waiver.\n\nSigned.", fppm_waiver_version: "2.1 <b>", fppm_oath_text: "I'll be there.", fppm_team_name: "FPPM & Co", fppm_team_city: "" } },
  { name: "join form, no events, no catalog mockups", uri: "/go/", php: ["fppm_sc_register()"], ts: [(c) => scRegister(c)], intended: signIn,
    options: { fppm_events: [], fppm_store_catalog: "[{\"name\":\"Hoodie\",\"variants\":[{\"id\":1,\"price\":40}]}]" } },

  /* [fppm_account] */
  account("signed out", 0),
  account("fan", 3, { get: { fppm_note: "registered" } }),
  account("player, dues open", 4, { get: { fppm_note: "rsvpset" } }),
  account("player, PayPal dues link set", 4, { options: { fppm_pp_dues: " https://www.paypal.com/ncp/payment/ABC?x=1&y=2 " } }),
  account("supporter, paid", 5, { get: { fppm_note: "nope" } }),
  account("supporter, open, PayPal link", 5, { options: { fppm_pp_supporter: "https://www.paypal.com/ncp/payment/SUP" },
    meta: [[5, "fppm_dues_log", [{ num: 1, amount: "40.00", overview: "x", created: "2026-10-10 11:30:00", status: "open", paid_at: "", paid_by: 0 }, { num: "2", amount: "1,000.50", overview: "y", created: "", paid_at: "", paid_by: 0 }]]] }),
  account("invited fan", 7, { get: { fppm_note: "err" } }),
  account("awkward player", 8, { get: { fppm_note: "playeractive" } }),
  account("active player", 9),
  account("bare sign-in: finish joining", 6),
  account("bare sign-in, refused", 6, { get: { fppm_err: "Please fill in your name, phone and full address." } }),
  account("bare sign-in with a name", 6, { meta: [[6, "first_name", "Gail"], [6, "last_name", "O'Google"], [6, "fppm_phone", "772 <555>"]] }),
  account("incomplete: no oath", 3, { meta: [[3, "fppm_oath", { accepted: 0 }]] }),
  account("staff", 2, { get: { fppm_note: "announced" } }),
  account("administrator", 1, { get: { fppm_note: "deleted" } }),
  account("staff, store not set up", 2, { options: { fppm_pp_client_id: "" } }),
  account("player, store not set up", 4, { options: { fppm_pp_client_id: "" } }),
  account("player, no announcements", 4, { options: { fppm_announcements: [] } }),
  account("ticker shows at 89 members and 12 shirts", 4, { users: manyMembers(), options: { fppm_shirts_sold_manual: "10", fppm_store_shirts_sold: "2" } }),
  { name: "ticker on the join form", uri: "/go/", users: manyMembers(), options: { fppm_shirts_sold_manual: "1000" }, php: ["fppm_ticker_html()"], ts: [tickerHtml] },
  { name: "ticker hidden below 12 shirts", users: manyMembers(), options: { fppm_shirts_sold_manual: "11" }, php: ["fppm_ticker_html()"], ts: [tickerHtml] },

  /* Cards and pieces */
  { name: "apparel: extra items, embroidered, PayPal fallback", uid: 0, options: { fppm_apparel_extra: [{ key: "Hat!", label: "Cap <b>", desc: "One size", price: "18", url: "", pp_key: "fppm_pp_hat" },
    { key: "scarf", label: "Scarf", price: 0, url: "javascript:alert(1)" }, { key: "", label: "skipped" }, { key: "emb", label: "Emb tee", price: 25, emb: 30, url: "https://fppm.printful.me/x" }], fppm_pp_hat: "https://paypal.me/hat", fppm_tshirt_url: "https://fppm.printful.me/product/new tee" },
    php: ["fppm_apparel_block()"], ts: [apparelBlock] },
  { name: "apparel: no shop url", options: { fppm_shop_url: "" }, php: ["fppm_apparel_block()"], ts: [apparelBlock] },
  { name: "store: legacy tee variants", uid: 4, options: { fppm_store_catalog: "", fppm_tee_variants: "s:7001\nm: 7002, XL:abc\nnocolon\n:5" }, php: ["fppm_apparel_block()", "json_encode(fppm_store_catalog())"],
    ts: [apparelBlock, (c) => JSON.stringify(storeCatalog(c))] },
  { name: "store: catalog JSON broken", uid: 4, options: { fppm_store_catalog: "{nope" }, php: ["fppm_apparel_block()"], ts: [apparelBlock] },
  { name: "merch teaser picks the tee", php: ["fppm_merch_teaser_html()"], ts: [merchTeaserHtml] },
  { name: "invite card, custom join url", uid: 3, options: { fppm_join_url: "https://fppm.us/join/?ref=a b&c=d", fppm_team_name: "Martins' \"FC\"" }, php: ["fppm_invite_card()"], ts: [inviteCard] },
  { name: "install card", php: ["fppm_install_card()"], ts: [installCard] },
  { name: "announcements, latest five", options: { fppm_announcements: Array.from({ length: 7 }, (_, i) => ({ title: "T" + i, body: "Line\r\nnext " + i, at: "2026-11-0" + (i + 1) + " 10:00:00", by: 1 })) },
    php: ["fppm_announcements_html()"], ts: [(c) => announcementsHtml(c)] },
  { name: "flash notes", get: { fppm_note: "DuesPaid" }, php: ["fppm_flash_html()"], ts: [flashHtml] },
  { name: "waiver text and hash (default)", php: ["fppm_waiver_text()", "fppm_waiver_hash()"], ts: [waiverText, waiverHash] },
  { name: "complete form directly", uid: 6, php: ["fppm_complete_form()"], ts: [completeForm] },
  { name: "staff dashboard", uid: 2, uri: "/account/?fppm_note=noted", get: { fppm_note: "noted" }, php: ["fppm_staff_dashboard()"], ts: [staffDashboard] },
  { name: "member dashboard directly", uid: 4, php: ["fppm_member_dashboard()"], ts: [memberDashboard] },

  /* Events and calendars, at different times */
  { name: "schedule: Friday noon", uid: 4, php: ["fppm_schedule_member_html(4)", "fppm_schedule_staff_html()", "fppm_next_event_public_html()"], ts: [(c) => scheduleMemberHtml(c, 4), scheduleStaffHtml, nextEventPublicHtml] },
  { name: "schedule: Saturday during conditioning", now: SAT_0830, uid: 5, php: ["fppm_schedule_member_html(5)", "fppm_schedule_staff_html()", "fppm_next_event_public_html()"], ts: [(c) => scheduleMemberHtml(c, 5), scheduleStaffHtml, nextEventPublicHtml] },
  { name: "schedule: Saturday after conditioning", now: SAT_0930, uid: 9, php: ["fppm_schedule_member_html(9)", "fppm_next_event_public_html()"], ts: [(c) => scheduleMemberHtml(c, 9), nextEventPublicHtml] },
  { name: "schedule: Sunday", now: SUN, uid: 3, php: ["fppm_schedule_member_html(3)", "fppm_schedule_staff_html()"], ts: [(c) => scheduleMemberHtml(c, 3), scheduleStaffHtml] },
  { name: "schedule: after the match", now: MATCH_NIGHT, uid: 8, php: ["fppm_schedule_member_html(8)", "fppm_schedule_staff_html()"], ts: [(c) => scheduleMemberHtml(c, 8), scheduleStaffHtml] },
  { name: "schedule: none", uid: 4, options: { fppm_events: [] }, php: ["fppm_schedule_member_html(4)", "fppm_schedule_staff_html()", "fppm_next_event_public_html()"], ts: [(c) => scheduleMemberHtml(c, 4), scheduleStaffHtml, nextEventPublicHtml] },
  { name: "schedule: odd events", uid: 4, options: { fppm_events: [
    { id: 7, type: "match", recur: "none", title: "", date: "2026-11-30", time: "7:05 pm", end: "21:00", location: "", lat: "27.1", lng: "", notes: "", rsvps: { 4: "maybe" } },
    { id: "8", type: "practice", recur: "weekly", weekday: "0", title: "Keepers", time: "", end: "", location: "Park & Rec", lat: "-1.5", lng: "2", notes: "Bring \"gloves\"; extra, stuff", rsvps: [] },
    { id: 9, type: "event", recur: "weekly", weekday: 5, time: "06:00", end: "05:00", rsvps: { 9: "in", 4: "out", 5: "in" } },
    { id: 10, type: "mystery", recur: "none", date: "2026-11-20", time: "", rsvps: "x" }] },
    php: ["fppm_schedule_member_html(4)", "fppm_schedule_staff_html()", "json_encode(array_map(fn($e) => [fppm_event_gcal_url($e), fppm_event_outlook_url($e), fppm_event_when($e)], fppm_events_upcoming()), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)"],
    ts: [(c) => scheduleMemberHtml(c, 4), scheduleStaffHtml, (c) => JSON.stringify(eventsUpcoming(c).map((e) => [gcalUrl(c, e), outlookUrl(c, e), eventWhen(c, e)]))] },
  { name: "calendar links for every event", php: ["implode('|', array_map('fppm_event_calendar_html', fppm_events_get()))"], ts: [(c) => eventsGet(c).map((e) => calendarHtml(c, e)).join("|")] },
  { name: ".ics: the conditioning", get: { fppm_ics: "1" }, php: ["fppm_ics_serve()"], ts: [(c) => streamed(icsServe(c, "1"))] },
  { name: ".ics: the match", get: { fppm_ics: "2abc" }, php: ["fppm_ics_serve()"], ts: [(c) => streamed(icsServe(c, "2abc"))] },
  { name: ".ics: no such event", get: { fppm_ics: "99" }, php: ["fppm_ics_serve()"], ts: [async (c) => { const r = icsServe(c, "99"); return (await r.text()) + exitJson([]); }] },

  /* The app */
  { name: "PWA manifest", get: { fppm_pwa: "manifest" }, php: ["fppm_pwa_serve()"], ts: [(c) => manifestJson(c) + exitJson(["Content-Type: application/manifest+json; charset=utf-8"])] },
  { name: "PWA service worker", get: { fppm_pwa: "SW" }, php: ["fppm_pwa_serve()"], ts: [(c) => swJs(c) + exitJson(["Content-Type: application/javascript; charset=utf-8", "Service-Worker-Allowed: /"])] },
  { name: "PWA head and footer", php: ["fppm_pwa_head()", "fppm_pwa_footer()"], ts: [pwaHead, pwaFooter] },
  { name: "PWA manifest, renamed team", options: { fppm_team_name: "Purple <Martins> & \"Friends\"" }, get: { fppm_pwa: "manifest" }, php: ["fppm_pwa_serve()"],
    ts: [(c) => manifestJson(c) + exitJson(["Content-Type: application/manifest+json; charset=utf-8"])] },

  /* The gates */
  gate("signed out, front page", "front"),
  gate("signed out, /go/", "go"),
  gate("signed out, account", "account"),
  gate("signed out, roster", "roster"),
  gate("signed out, 404", "notfound"),
  gate("signed out, manifest", "roster", 0, { get: { fppm_pwa: "x" } }),
  gate("signed out, extra public slug", "privacy", 0, { options: { fppm_public_slugs: " Privacy Policy , ,terms" } }),
  gate("signed out, gate off", "roster", 0, { options: { fppm_login_gate: "0" } }),
  gate("signed out, custom join url", "roster", 0, { options: { fppm_join_url: "https://fppm.us/join/?a=1" } }),
  gate("member, roster", "roster", 4),
  gate("bare sign-in, roster", "roster", 6),
  gate("bare sign-in, account page", "account", 6),
  gate("bare sign-in, 404", "notfound", 6),
  gate("staff without membership, roster", "roster", 2),
];
