/**
 * [aerial_timelapse user_id editable] (AT_Shortcode): a thin container the
 * player script fills from the REST API, plus the player's style and script
 * (served from public/ at the plugin's own path) and its atConfig.
 */
import { type Ctx, homeUrl, loggedIn, nonce } from "../ctx";
import { esc, phpInt } from "../php";
import { escUrlRaw } from "../wpfn";
import { can } from "../admin/core";
import { type Atts, shortcodeAtts } from "../render/home";
import { AT_PLUGIN_URL, AT_VERSION } from "./property";

/** register_assets() (wp_enqueue_scripts): registered only; the shortcode enqueues them. */
export const registerAssets = (_c: Ctx) => undefined;

export function timelapse(c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({ user_id: "0", editable: "yes" }, atts);
  if (!loggedIn(c)) return '<p class="at-notice">Please log in to see your property timelapse.</p>';
  let uid = phpInt(a.user_id);
  if (uid && !can(c, "edit_users")) uid = 0;
  c.assets.styles["at-player"] = { src: AT_PLUGIN_URL + "assets/player.css", ver: AT_VERSION };
  c.assets.scripts["at-player"] = { src: AT_PLUGIN_URL + "assets/player.js", ver: AT_VERSION };
  (c.assets.localized["at-player"] ??= {}).atConfig = { restUrl: escUrlRaw(homeUrl(c, "/wp-json/aerial-timelapse/v1/property")), nonce: nonce("wp_rest") };
  return '<div class="at-root" data-at-root'
    + (uid ? ' data-at-user="' + esc(String(uid)) + '"' : "")
    + ' data-at-editable="' + (a.editable === "yes" ? "yes" : "no") + '">'
    + '<p class="at-loading">Loading aerial timelapse…</p>'
    + "</div>";
}
