/** WordPress's form helpers as the plugin's markup uses them, printed the way WordPress prints them. */
import { type Ctx, nonce } from "../ctx";
import { esc, escUrl } from "../php";
import { removeQueryArg } from "../wp";

/** wp_referer_field(): the request's own address. */
export const refererField = (c: Ctx) => '<input type="hidden" name="_wp_http_referer" value="' + escUrl(removeQueryArg("_wp_http_referer", c.requestUri)) + '" />';
/** wp_nonce_field( $action, $name ): the token field (a placeholder: the Worker checks the origin) and the referer field. */
export function nonceField(c: Ctx, action: string, name = "_wpnonce"): string {
  const n = esc(name);
  return '<input type="hidden" id="' + n + '" name="' + n + '" value="' + nonce(action) + '" />' + refererField(c);
}
/** selected() / checked(): WordPress compares the two as strings. */
const same = (a: unknown, b: unknown) => sv(a) === sv(b);
const sv = (v: unknown) => (v === true ? "1" : v === false || v === null || v === undefined ? "" : String(v));
export const selected = (a: unknown, b: unknown = true) => (same(a, b) ? " selected='selected'" : "");
export const checked = (a: unknown, b: unknown = true) => (same(a, b) ? " checked='checked'" : "");
/** settings_fields( $group ). */
export const settingsFields = (c: Ctx, group: string) =>
  "<input type='hidden' name='option_page' value='" + esc(group) + "' />" + '<input type="hidden" name="action" value="update" />' + nonceField(c, group + "-options");
/** submit_button(). */
export const submitButton = (text = "Save Changes") => '<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" value="' + esc(text) + '"  /></p>';
/** wp_nonce_url( $url, $action ): esc_html() of the URL with &_wpnonce= added. */
export const nonceUrl = (url: string, action: string) => esc(url + (url.includes("?") ? "&" : "?") + "_wpnonce=" + nonce(action));
