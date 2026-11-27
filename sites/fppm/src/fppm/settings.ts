/**
 * Section 10: Purple Martins → Settings (administrators), saved through
 * options.php as WordPress did (each registered setting: the posted value,
 * trimmed, or empty when absent); and GFF Drive Backup's page and nightly job.
 *
 * Intended difference: the three credentials (PayPal secret, Printful token,
 * the Sheet's service-account JSON) are Worker secrets. Their rows show
 * whether each is set and the command that sets it — never a value — and
 * options.php does not save them.
 */
import { type Ctx, adminUrl, can, homeUrl, opt, setOpt } from "../ctx";
import { esc, escTextarea, escUrl, gmdate, numberFormat, phpInt, phpNum, truthy } from "../php";
import { addQueryArg, currentMysql, DieReply, getReferer, RedirectReply, siteOffset } from "../wp";
import type { AjaxCtx } from "../ajax";
import {
  collective, couponIssued, couponPercent, defaultStoreUrl, defaultTshirtUrl, gsClientEmail, gsJson, gsTab, oathText, priceEmbroidery, pricePlayerDues,
  priceSupporterMin, priceTshirt, priceTshirtEmb, str, supporterPool, teamCity, teamName, waiverVersion, wcActive,
} from "./core";
import { gateEnabled } from "./gate";
import { ppEnv, printfulStoreId, printfulToken, ppSecret, storeCatalog, storeReady } from "./store";
import { checked, nonceField, nonceUrl, selected, settingsFields, submitButton } from "./ui";
import { FPPM_SETTINGS_PAGE, GFF_DBK_SETTINGS_PAGE } from "./templates.gen";
import { sanitizeTextField } from "../wpfn";

/** fppm_register_settings(), less the three credentials (Worker secrets). */
export const FPPM_SETTINGS = ["fppm_team_name", "fppm_team_city", "fppm_notify_email", "fppm_price_player_dues", "fppm_price_supporter_min", "fppm_price_tshirt",
  "fppm_pp_dues", "fppm_pp_supporter", "fppm_pp_tshirt", "fppm_price_embroidery", "fppm_coupon_amount", "fppm_coupon_percent", "fppm_supporter_code_pool", "fppm_shared_promo",
  "fppm_collective", "fppm_shop_url", "fppm_tshirt_url", "fppm_wc_tshirt_id", "fppm_wc_tshirt_emb_id", "fppm_wc_dues_id", "fppm_wc_supporter_id", "fppm_pp_env", "fppm_pp_client_id",
  "fppm_printful_store_id", "fppm_tee_variants", "fppm_store_catalog", "fppm_printful_confirm", "fppm_shirts_sold_manual", "fppm_waiver_version", "fppm_waiver_text",
  "fppm_oath_text", "fppm_gs_sheet_id", "fppm_gs_tab", "fppm_login_gate", "fppm_join_url", "fppm_public_slugs", "fppm_join_intro"];
export const SECRET_SETTINGS: Record<string, string> = { fppm_pp_secret: "PAYPAL_SECRET", fppm_printful_token: "PRINTFUL_TOKEN", fppm_gs_json: "GOOGLE_SA_JSON" };

const ostr = (c: Ctx, k: string, d = "") => str(opt(c, k, d));

/** fppm_settings_page(). */
export function settingsPage(c: AjaxCtx): string {
  if (!can(c, "manage_options")) return "";
  const T = FPPM_SETTINGS_PAGE;
  const g = c.get;
  let o = T[0];
  if (g.fppm_catalog !== undefined && g.fppm_catalog === "ok") {
    const ni = phpInt(g.img !== undefined ? g.img : 0);
    o += T[1] + phpInt(g.p !== undefined ? g.p : 0) + T[2] + phpInt(g.v !== undefined ? g.v : 0) + T[3]
      + "<strong>" + ni + "</strong> with mockup images." + (ni === 0 ? " <em>(Printful returned no mockups for this store — the store shows names/prices only. Open each product in Printful and make sure it has a generated mockup, then Fetch again.)</em>" : "") + T[4];
  } else if (g.fppm_catalog !== undefined) {
    o += T[5] + esc(sanitizeTextField(g.fppm_catalog_msg !== undefined ? str(g.fppm_catalog_msg) : "unknown error")) + T[6];
  }
  const pool = supporterPool(c), issued = couponIssued(c);
  const used = pool.filter((x) => issued.includes(x)).length;
  const cat = storeCatalog(c);
  let nv = 0;
  for (const p of cat) nv += p.variants.length;
  o += T[7] + settingsFields(c, "fppm_settings") + T[8] + esc(teamName(c)) + T[9] + esc(teamCity(c)) + T[10] + esc(ostr(c, "fppm_collective")) + T[11] + esc(ostr(c, "fppm_notify_email"))
    + T[12] + esc(str(opt(c, "admin_email", false))) + T[13] + esc(phpNum(pricePlayerDues(c))) + T[14] + esc(phpNum(priceSupporterMin(c))) + T[15] + esc(phpNum(priceTshirt(c)))
    + T[16] + esc(phpNum(priceEmbroidery(c))) + T[17] + esc(numberFormat(priceTshirtEmb(c), 0)) + T[18]
    + " <strong>Pool:</strong> " + pool.length + " codes, " + used + " assigned, " + (pool.length - used) + " available."
    + T[19] + esc(phpNum(couponPercent(c))) + T[20] + escTextarea(ostr(c, "fppm_supporter_code_pool")) + T[21] + esc(ostr(c, "fppm_shared_promo"))
    + T[22] + esc(numberFormat(pricePlayerDues(c), 0)) + T[23] + esc(ostr(c, "fppm_pp_dues")) + T[24] + esc(numberFormat(priceSupporterMin(c), 0)) + T[25] + esc(ostr(c, "fppm_pp_supporter"))
    + T[26] + esc(numberFormat(priceTshirt(c), 0)) + T[27] + esc(ostr(c, "fppm_pp_tshirt")) + T[28] + esc(ostr(c, "fppm_shop_url")) + T[29] + esc(defaultStoreUrl()) + T[30] + esc(defaultStoreUrl())
    + T[31] + esc(ostr(c, "fppm_tshirt_url")) + T[32] + esc(defaultTshirtUrl()) + T[33] + esc(numberFormat(priceTshirt(c), 0)) + T[34] + esc(defaultTshirtUrl())
    + T[35] + (storeReady(c) ? "✅ yes (" + esc(ppEnv(c)) + ")" : "❌ not configured") + T[36] + selected(ppEnv(c), "sandbox") + T[37] + selected(ppEnv(c), "live")
    + T[38] + esc(ostr(c, "fppm_pp_client_id")) + T[39] + "" + T[40] + "" + T[41] + esc(printfulStoreId(c)) + T[42] + escTextarea(ostr(c, "fppm_store_catalog"))
    + T[43] + "Loaded: " + cat.length + " product(s), " + nv + " variant(s)." + T[44] + escUrl(nonceUrl(adminUrl(c, "admin-post.php?action=fppm_fetch_catalog"), "fppm_fetch_catalog"))
    + T[45] + escTextarea(ostr(c, "fppm_tee_variants")) + T[46] + checked("1", opt(c, "fppm_printful_confirm", "0")) + T[47] + (wcActive(c) ? "✅ yes" : "❌ no (PayPal mode)")
    + T[48] + esc(phpInt(opt(c, "fppm_wc_tshirt_id", 0))) + T[49] + esc(phpInt(opt(c, "fppm_wc_dues_id", 0))) + T[50] + esc(numberFormat(pricePlayerDues(c), 0))
    + T[51] + esc(phpInt(opt(c, "fppm_wc_supporter_id", 0))) + T[52] + esc(phpInt(opt(c, "fppm_shirts_sold_manual", 0))) + T[53] + checked(gateEnabled(c))
    + T[54] + esc(ostr(c, "fppm_join_url")) + T[55] + esc(homeUrl(c, "/go/")) + T[56] + esc(ostr(c, "fppm_public_slugs")) + T[57] + escTextarea(ostr(c, "fppm_join_intro"))
    + T[58] + escTextarea(ostr(c, "fppm_oath_text")) + T[59] + esc(oathText(c)) + T[60] + escUrl(adminUrl(c, "admin.php?page=fppm-waivers")) + T[61] + esc(waiverVersion(c))
    + T[62] + escTextarea(ostr(c, "fppm_waiver_text")) + T[63];
  if (gsClientEmail(c)) o += T[64] + esc(gsClientEmail(c)) + T[65];
  o += T[66] + "" + T[67] + esc(ostr(c, "fppm_gs_sheet_id")) + T[68] + esc(gsTab(c)) + T[69] + submitButton() + T[70];
  return withSecretRows(c, o);
}

/** The three credential rows: whether each Worker secret is set, and how to set it. */
export const SECRET_ROWS: [RegExp, string, string, () => string][] = [
  [/<tr><th scope="row">PayPal Secret<\/th><td><input type="password" name="fppm_pp_secret" value="[^"]*" class="large-text" autocomplete="off"><\/td><\/tr>/, "PayPal Secret", "PAYPAL_SECRET", () => ""],
  [/<tr><th scope="row">Printful API token<\/th><td><input type="password" name="fppm_printful_token" value="[^"]*" class="large-text" autocomplete="off">(<p class="description">[^<]*<\/p>)<\/td><\/tr>/, "Printful API token", "PRINTFUL_TOKEN", () => ""],
  [/<tr><th scope="row">Service-account JSON<\/th><td><textarea name="fppm_gs_json" rows="6" class="large-text" placeholder='[^']*'>[^<]*<\/textarea><\/td><\/tr>/, "Service-account JSON", "GOOGLE_SA_JSON", () => ""],
];
export function secretRow(label: string, name: string, set: boolean): string {
  return '<tr><th scope="row">' + label + "</th><td><p><strong>" + (set ? "Set" : "Not set") + "</strong> — a Worker secret, never shown here. Set or replace it with <code>wrangler secret put " + name + "</code>"
    + (name === "GOOGLE_SA_JSON" ? " (paste the whole downloaded key file)" : "") + ".</p></td></tr>";
}
export function withSecretRows(c: Ctx, html: string): string {
  const set: Record<string, boolean> = { PAYPAL_SECRET: ppSecret(c) !== "", PRINTFUL_TOKEN: printfulToken(c) !== "", GOOGLE_SA_JSON: gsJson(c).trim() !== "" };
  for (const [re, label, name] of SECRET_ROWS) {
    if (!re.test(html)) throw new Error("settings page: the " + label + " row moved");
    html = html.replace(re, () => secretRow(label, name, set[name]));
  }
  return html;
}

/** options.php: save the posted settings group, as WordPress did, then back to the form with settings-updated=true. */
export async function saveSettings(c: AjaxCtx & { referer?: string }): Promise<RedirectReply | DieReply> {
  if (!can(c, "manage_options")) return new DieReply("Sorry, you are not allowed to manage options for this site.");
  const group = str(c.post.option_page);
  const names = group === "fppm_settings" ? FPPM_SETTINGS : group === "gff_dbk_group" ? DBK_SETTINGS : null;
  if (!names) return new DieReply("<strong>Error:</strong> The options page was not found in the allowed options list.");
  for (const name of names) {
    const v = c.post[name];
    await setOpt(c, name, v === undefined ? "" : Array.isArray(v) ? v : v.trim());
  }
  const back = getReferer(c, "/wp-admin/options.php") || "/wp-admin/options.php";
  return new RedirectReply(addQueryArg({ "settings-updated": "true" }, back));
}

/* ---- GFF Drive Backup (installed on fppm.us beside the team plugin; it backs up the GFF plugin's customers, which this site does not have) ---- */
export const DBK_HOOK = "gff_dbk_daily_event";
/** register_setting( 'gff_dbk_group', … ) less the service-account JSON (not needed here, and never kept in D1). */
export const DBK_SETTINGS = ["gff_dbk_folder_id", "gff_dbk_target_file_id"];
/** gff_dbk_do_backup(): without the GFF plugin's gff_reg_collect_clients() there is nothing to back up. */
export const doBackup = async (_c: Ctx) => "SKIPPED: main GFF plugin not active (gff_reg_collect_clients missing).";
/** gff_dbk_run_backup() (the nightly job): the outcome goes to the log. */
export async function runBackup(c: Ctx): Promise<void> {
  await setOpt(c, "gff_dbk_last_log", currentMysql(c) + " — " + (await doBackup(c)));
}
/** WP-Cron's 'daily' recurrence: the planned time moves on by whole days past now. */
export function nextRun(c: Ctx): number {
  let t = phpInt(opt(c, "cron_next:" + DBK_HOOK, 0)) || 1795838460;
  while (t <= c.now) t += 86400;
  return t;
}
/** gff_dbk_settings_page() (Tools → GFF Drive Backup), with its "Run backup now". */
export async function dbkSettingsPage(c: AjaxCtx): Promise<string> {
  if (!can(c, "manage_options")) return "";
  let o = "";
  if (c.post.gff_dbk_run_now !== undefined) {
    const msg = await doBackup(c);
    await setOpt(c, "gff_dbk_last_log", currentMysql(c) + " — " + msg);
    o += '<div class="notice notice-info is-dismissible"><p>Backup run: ' + esc(msg) + "</p></div>";
  }
  const target = ostr(c, "gff_dbk_target_file_id"), log = ostr(c, "gff_dbk_last_log");
  const next = phpInt(opt(c, "cron_next:" + DBK_HOOK, 0));
  const T = GFF_DBK_SETTINGS_PAGE;
  o += T[0] + (next ? T[1] + esc(gmdate("M j, Y g:i A", next + siteOffset(c, next))) + T[2] : T[3]) + T[4];
  if (truthy(log)) o += T[5] + esc(log) + T[6];
  o += T[7] + T[10] + settingsFields(c, "gff_dbk_group") + T[11] + "gff_dbk_target_file_id" + T[12] + "gff_dbk_target_file_id" + T[13] + "gff_dbk_target_file_id" + T[14] + esc(target)
    + T[15] + "gff_dbk_sa_json" + T[16] + "gff_dbk_sa_json" + T[17] + "gff_dbk_sa_json" + T[18] + escTextarea("") + T[19] + submitButton("Save settings") + T[20] + nonceField(c, "gff_dbk_run_now") + T[21];
  return o.replace(DBK_JSON_ROW, () => '<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON</label></th>\n\t\t\t\t\t<td><p><strong>Not needed on this site</strong> — this plugin backs up the Gawlak Family Farms customer list, which fppm.us does not have, so every run only logs SKIPPED.</p></td>\n\t\t\t\t</tr>');
}
export const DBK_JSON_ROW = /<tr>\n\t\t\t\t\t<th scope="row"><label for="gff_dbk_sa_json">Service-account JSON<\/label><\/th>[\s\S]*?<\/tr>/;
