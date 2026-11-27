/**
 * The requests test/actions.parity.ts replays through the plugin and the
 * Worker, in order (state carries over from step to step). People in the
 * fixture (test/fixture.php): 1 administrator, 2 staff, 3 fan, 4 player
 * (trialist, $10 open), 5 supporter (paid), 6 a bare Google sign-in, 7 a fan
 * with a player invite, 8 a player with awkward characters and two open dues,
 * 9 an active player.
 */
import { SA_JSON } from "./fakes";

export interface Step {
  uid: number;
  action: string;
  post?: Record<string, string>;
  get?: Record<string, string>;
  tag?: string;
  /** The page the request came from (the Referer header; wp_get_referer()). */
  referer?: string;
  ua?: string;
}

/** The join form as the page posts it (without the password field: MIGRATION.md). */
const join = (f: Record<string, string>, tag = "join"): Step => ({ uid: 0, action: "@page", tag, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148 <script>",
  post: { fppm_register_nonce: "nonce-fppm_register", fppm_action: "register", fppm_type: "fan", fppm_website: "", fppm_first: "Nia", fppm_last: "New", fppm_email: "nia.new@example.test",
    fppm_phone: "772-555-0199", fppm_address: "1 New St", fppm_city: "Fort Pierce", fppm_state: "fl", fppm_zip: "34950", fppm_waiver_accept: "1", fppm_oath_accept: "1", fppm_optin: "1", ...f } });
const complete = (uid: number, f: Record<string, string>, tag = "complete"): Step => ({ uid, action: "@post:fppm_complete", tag, referer: "https://fppm.us/account/", ua: "Mozilla/5.0 (Android 15)",
  post: { action: "fppm_complete", _wpnonce: "nonce-fppm_complete", fppm_type: "fan", fppm_first: "Gail", fppm_last: "Google", fppm_phone: "772-555-0166", fppm_address: "6 Palm Ave",
    fppm_city: "Fort Pierce", fppm_state: "Fl", fppm_zip: "34946", fppm_waiver_accept: "1", fppm_oath_accept: "1", ...f } });
const post = (uid: number, action: string, f: Record<string, string> = {}, tag = "staff", referer = "https://fppm.us/account/"): Step =>
  ({ uid, action: "@post:" + action, tag, referer, post: { action, _wpnonce: "nonce-x", ...f } });
const opt = (f: Record<string, string>, tag = "setup"): Step => ({ uid: 0, action: "@option", post: f, tag });

const fifty = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ title: "Update " + i, body: "Body " + i, at: "2026-10-01 10:00:00", by: 2 })));

export const STEPS: Step[] = [
  /* ---- The join form: every refusal, then new members of each type ---- */
  { ...join({}), post: { fppm_action: "register", fppm_email: "x@example.test" } },
  join({ fppm_website: "http://spam.example" }),
  join({ fppm_first: "  ", fppm_last: "<b>Bold</b>" }),
  join({ fppm_email: "not an email" }),
  join({ fppm_phone: "" }),
  join({ fppm_zip: " " }),
  join({ fppm_waiver_accept: "" }),
  join({ fppm_oath_accept: "0" }),
  join({ fppm_email: "FAN1@example.test" }),
  { ...join({}), post: { ...join({}).post!, fppm_action: "subscribe" } },
  { ...join({}), uid: 3 },
  join({ fppm_type: "coach", fppm_first: "Nia <i>", fppm_last: "O'New", fppm_optin: "" }),
  join({ fppm_type: "player", fppm_email: "player1@other.test", fppm_first: "Pia", fppm_last: "Second", fppm_dob: "2001-02-03", fppm_position: "ST", fppm_jersey: "1a0",
    fppm_ec_name: "Mom", fppm_ec_phone: "772-555-0100" }),
  join({ fppm_type: "player", fppm_email: "player1@third.test", fppm_position: "QB", fppm_jersey: "" }),
  opt({ fppm_supporter_code_pool: "POOL1, POOL2\nFPPMFF110 0" }),
  join({ fppm_type: "supporter", fppm_email: "sup.two@example.test", fppm_first: "Sue", fppm_last: "Two", fppm_shirt: "M", fppm_contribution: "10" }),
  join({ fppm_type: "supporter", fppm_email: "!!!@example.test", fppm_first: "Sid", fppm_last: "Three", fppm_shirt: "huge", fppm_contribution: "40.5" }),
  opt({ fppm_supporter_code_pool: "", fppm_shared_promo: "LITTY10", fppm_notify_email: "coach-alerts@example.test" }),
  join({ fppm_type: "supporter", fppm_email: "sup.four@example.test", fppm_first: "Sal", fppm_last: "Four", fppm_contribution: "abc" }),
  // The waiver's off-server copy: a new tab gets the header first; then rows only; a refused append; a broken key file.
  opt({ fppm_shared_promo: "", fppm_notify_email: "", fppm_gs_json: SA_JSON, fppm_gs_sheet_id: "sheet-new" }, "sheet"),
  join({ fppm_email: "sheet.one@example.test", fppm_first: "Shay" }, "sheet"),
  join({ fppm_email: "sheet.two@example.test", fppm_first: "Shaw", fppm_type: "player" }, "sheet"),
  opt({ fppm_gs_sheet_id: "sheet-locked", fppm_gs_tab: "It's Waivers" }, "sheet"),
  join({ fppm_email: "sheet.three@example.test" }, "sheet"),
  opt({ fppm_gs_sheet_id: "sheet-has-tab", fppm_gs_tab: "" }, "sheet"),
  join({ fppm_email: "sheet.four@example.test" }, "sheet"),
  opt({ fppm_gs_json: "{\"client_email\":\"x@y.z\"}" }, "sheet"),
  join({ fppm_email: "sheet.five@example.test" }, "sheet"),
  opt({ fppm_gs_json: "", fppm_waiver_version: "2.0", fppm_waiver_text: "Custom waiver for {$team}.", fppm_oath_text: "I promise." }),
  join({ fppm_email: "v2@example.test" }),

  /* ---- Finishing a bare sign-in (fppm_complete) ---- */
  { uid: 0, action: "@post:fppm_complete", post: { action: "fppm_complete" }, tag: "complete" },
  complete(6, { fppm_address: "" }),
  complete(6, { fppm_waiver_accept: "" }),
  complete(6, { fppm_oath_accept: "" }),
  complete(6, { fppm_type: "player", fppm_position: "GK", fppm_jersey: "#12", fppm_dob: "1990-01-01" }),
  complete(3, { fppm_type: "supporter", fppm_first: "Fay", fppm_last: "Fan", fppm_contribution: "30", fppm_shirt: "XL" }),
  complete(2, { fppm_type: "player" }),
  opt({ fppm_waiver_version: "1.0", fppm_waiver_text: "", fppm_oath_text: "" }),

  /* ---- Members: the player invite, RSVPs, deleting one's account ---- */
  post(2, "fppm_player_invite", { uid: "4" }),
  post(4, "fppm_player_invite", { uid: "3" }),
  post(2, "fppm_player_invite", { uid: "0" }),
  post(7, "fppm_accept_invite", {}, "member"),
  post(3, "fppm_accept_invite", {}, "member"),
  post(0, "fppm_accept_invite", {}, "member"),
  post(4, "fppm_rsvp", { id: "2", status: "in" }, "rsvp"),
  post(4, "fppm_rsvp", { id: "1", status: "out" }, "rsvp"),
  post(9, "fppm_rsvp", { id: "5", status: "maybe" }, "rsvp"),
  post(3, "fppm_rsvp", { id: "1", status: "in" }, "rsvp"),
  post(5, "fppm_rsvp", { id: "1", status: "in" }, "rsvp"),
  post(5, "fppm_rsvp", { id: "2", status: "maybe" }, "rsvp"),
  post(5, "fppm_rsvp", { id: "2", status: "yes" }, "rsvp"),
  post(5, "fppm_rsvp", { id: "77", status: "in" }, "rsvp", "https://fppm.us/account/?fppm_note=rsvpset&tab=2#schedule"),
  post(1, "fppm_self_delete", {}, "member"),
  post(9, "fppm_self_delete", {}, "member"),
  post(0, "fppm_self_delete", {}, "member"),

  /* ---- Staff ---- */
  post(2, "fppm_dues_mark", { uid: "8", num: "2", paid: "1" }),
  post(2, "fppm_dues_mark", { uid: "8", num: "2", paid: "0" }),
  post(2, "fppm_dues_mark", { uid: "4", num: "1", paid: "1" }, "staff", "https://evil.example/account/"),
  post(2, "fppm_dues_mark", { uid: "4", num: "9", paid: "1" }),
  post(3, "fppm_dues_mark", { uid: "4", num: "1", paid: "1" }),
  post(2, "fppm_set_status", { uid: "4", status: "rostered" }),
  post(2, "fppm_set_status", { uid: "4", status: "Captain" }),
  post(2, "fppm_save_notes", { uid: "4", notes: "Fast <b>winger</b>\n\nNeeds boots  " }),
  post(2, "fppm_save_notes", { uid: "0", notes: "nobody" }),
  post(2, "fppm_announce", { fppm_a_title: "", fppm_a_body: "x" }),
  post(2, "fppm_announce", { fppm_a_title: "Kickoff <b>moved</b>", fppm_a_body: "Now at 7:30pm.\nSee you there :)" }),
  opt({ fppm_announcements: fifty }),
  post(1, "fppm_announce", { fppm_a_title: "Fifty-first", fppm_a_body: "Oldest one drops off." }),
  post(2, "fppm_add_event", { etype: "match", etitle: "Miami \"United\"", erecur: "none", edate: "2026-12-12", etime: "19:00", eend: "21:00", eloc: "Lawnwood", ecoords: " 27.45 , -80.35 ", enotes: "Arrive 6:15" }),
  post(2, "fppm_add_event", { etype: "practice", erecur: "none", edate: "" }),
  post(2, "fppm_add_event", { etype: "party", erecur: "weekly", eweekday: "3", etime: "18:00", ecoords: "not, coords" }),
  post(2, "fppm_add_event", { erecur: "weekly" }),
  post(2, "fppm_delete_event", { id: "3" }),
  post(3, "fppm_delete_event", { id: "1" }),
  { uid: 2, action: "@post:fppm_export_roster", get: { action: "fppm_export_roster", _wpnonce: "x" }, tag: "staff" },
  { uid: 4, action: "@post:fppm_export_roster", get: { action: "fppm_export_roster" }, tag: "staff" },
  post(2, "fppm_admin_delete", { uid: "8" }),
  post(1, "fppm_admin_delete", { uid: "1" }),
  post(1, "fppm_admin_delete", { uid: "8" }),
  post(1, "fppm_admin_delete", { uid: "8" }),

  /* ---- The store: discounts, checkout, Printful, and their failures ---- */
  { uid: 0, action: "fppm_shop_create", post: { variant: "5001" }, tag: "shop" },
  { uid: 4, action: "fppm_shop_create", post: { variant: "5003" }, tag: "shop" },
  { uid: 3, action: "fppm_shop_create", post: { variant: "5001" }, tag: "shop" },
  { uid: 3, action: "fppm_shop_create", post: { variant: "999" }, tag: "shop" },
  { uid: 3, action: "fppm_shop_capture", post: { order_id: "PPORDER1" }, tag: "shop" },
  { uid: 4, action: "fppm_shop_capture", post: { order_id: "PPORDER1" }, tag: "shop" },
  { uid: 4, action: "fppm_shop_capture", post: { order_id: "PPORDER1" }, tag: "shop" },
  { uid: 3, action: "fppm_shop_capture", post: { order_id: "PPORDER2" }, tag: "shop" },
  { uid: 4, action: "@meta", post: { fppm_zip: "00000" }, tag: "shop" },
  { uid: 4, action: "fppm_shop_create", post: { variant: "6001" }, tag: "shop" },
  { uid: 4, action: "fppm_shop_capture", post: { order_id: "PPORDER3" }, tag: "shop" },
  opt({ fppm_printful_token: "" }, "shop"),
  { uid: 5, action: "fppm_shop_create", post: { variant: "5002" }, tag: "shop" },
  { uid: 5, action: "fppm_shop_capture", post: { order_id: "PPORDER4" }, tag: "shop" },

  /* ---- Admin screens and settings ---- */
  { uid: 1, action: "@admin:settings", tag: "admin" },
  { uid: 1, action: "@admin:settings", get: { fppm_catalog: "ok", p: "2", v: "5", img: "0" }, tag: "admin" },
  { uid: 1, action: "@admin:settings", get: { fppm_catalog: "err", fppm_catalog_msg: "Printful%20said%20<no>" }, tag: "admin" },
  { uid: 2, action: "@admin:settings", tag: "admin" },
  { uid: 1, action: "@post:fppm_fetch_catalog", get: { action: "fppm_fetch_catalog" }, tag: "catalog" },
  opt({ fppm_printful_token: "many-stores", fppm_printful_store_id: "" }, "catalog"),
  { uid: 1, action: "@post:fppm_fetch_catalog", get: { action: "fppm_fetch_catalog" }, tag: "catalog" },
  opt({ fppm_printful_token: "good-token" }, "catalog"),
  { uid: 2, action: "@post:fppm_fetch_catalog", get: { action: "fppm_fetch_catalog" }, tag: "catalog" },
  { uid: 1, action: "@post:fppm_fetch_catalog", get: { action: "fppm_fetch_catalog" }, tag: "catalog" },
  { uid: 1, action: "@admin:settings", tag: "catalog" },
  opt({ fppm_printful_token: "bad-token" }, "catalog"),
  { uid: 1, action: "@post:fppm_fetch_catalog", get: { action: "fppm_fetch_catalog" }, tag: "catalog" },
  { uid: 1, action: "@options", referer: "https://fppm.us/wp-admin/admin.php?page=fppm-settings", tag: "options",
    post: { option_page: "fppm_settings", action: "update", _wpnonce: "x", fppm_team_name: "  Fort Pierce Purple Martins FC ", fppm_price_player_dues: "15", fppm_login_gate: "0",
      fppm_printful_confirm: "1", fppm_public_slugs: "Privacy Policy, terms", fppm_store_catalog: "[]", fppm_waiver_text: "Line one\r\nLine two" } },
  { uid: 2, action: "@options", post: { option_page: "fppm_settings", fppm_team_name: "x" }, tag: "options" },
  { uid: 1, action: "@options", post: { option_page: "nope" }, tag: "options" },
  { uid: 1, action: "@admin:settings", tag: "options" },
  { uid: 1, action: "@admin:waivers", tag: "waivers" },
  { uid: 1, action: "@admin:waivers", get: { fppm_synced: "3", fppm_failed: "1" }, tag: "waivers" },
  { uid: 1, action: "@post:fppm_export_waivers", get: { action: "fppm_export_waivers" }, tag: "waivers" },
  { uid: 2, action: "@post:fppm_export_waivers", get: { action: "fppm_export_waivers" }, tag: "waivers" },
  { uid: 1, action: "@post:fppm_sync_waivers", get: { action: "fppm_sync_waivers" }, tag: "waivers" },
  opt({ fppm_gs_json: SA_JSON, fppm_gs_sheet_id: "sheet-has-tab", fppm_gs_tab: "Waivers" }, "waivers"),
  { uid: 1, action: "@admin:waivers", tag: "waivers" },
  { uid: 1, action: "@post:fppm_sync_waivers", get: { action: "fppm_sync_waivers" }, tag: "waivers" },
  { uid: 1, action: "@admin:waivers", get: { fppm_synced: "9", fppm_failed: "0" }, tag: "waivers" },
  { uid: 1, action: "@admin:drive", tag: "drive" },
  { uid: 1, action: "@admin:drive", post: { gff_dbk_run_now: "1", _wpnonce: "x" }, tag: "drive" },
  { uid: 1, action: "@options", referer: "https://fppm.us/wp-admin/tools.php?page=gff-drive-backup", post: { option_page: "gff_dbk_group", gff_dbk_target_file_id: " abc ", gff_dbk_folder_id: "f" }, tag: "drive" },
  { uid: 0, action: "@job:gff_dbk_daily_event", tag: "drive" },
  { uid: 1, action: "@admin:drive", tag: "drive" },
];
