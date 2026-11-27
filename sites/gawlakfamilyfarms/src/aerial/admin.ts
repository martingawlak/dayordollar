/**
 * The plugin's staff screens (AT_Admin): Settings → Aerial Timelapse (the
 * update-check status, the bulk-check URL, a "Run check now" link), and the
 * "Aerial Timelapse" section of a user's profile with its save (set, rebuild
 * or clear a customer's address) and the error notice it leaves. Ported for
 * the client admin's screens to call; checked by test/render.parity.ts.
 *
 * Intended difference (MIGRATION.md): the settings page's "Option B — WP-CLI"
 * block is gone — there is no WP-CLI on a Worker (it printed the server's
 * ABSPATH); the REST endpoint (Option A) does the same.
 */
import { type Ctx, nonce, opt, type User } from "../ctx";
import { esc, escUrl, phpInt } from "../php";
import { sanitizeTextField } from "../wpfn";
import { deleteTransient, getTransient, setTransient } from "../wp";
import { addQueryArg, can } from "../admin/core";
import { requestUri } from "../render/account";
import { buildProperty } from "./fetcher";
import { isAtError } from "./naip";
import { LAST_RUN_OPTION, run, token } from "./checker";
import { deleteProperty, getProperty } from "./property";

const query = (c: Ctx): Record<string, string | string[]> => ((c as Ctx & { get?: Record<string, string | string[]> }).get ?? {});

/** settings_page() */
export async function settingsPage(c: Ctx): Promise<string> {
  const endpoint = c.origin + "/wp-json/aerial-timelapse/v1/check-updates";
  const lv = opt(c, LAST_RUN_OPTION, false);
  const last: any = lv && typeof lv === "object" ? lv : null;
  let o = `\t\t<div class="wrap">
\t\t\t<h1>Aerial Timelapse — update checks</h1>
\t\t\t<p><strong>Checks run automatically:</strong> when a customer logs in, their property is
\t\t\t\tchecked for new imagery — at most once per week per customer, and each customer's
\t\t\t\tweekly cycle is staggered by signup date. No cron setup required.</p>
\t\t\t<p>For manual or bulk use (e.g. sweeping customers who rarely log in), a full check of
\t\t\t\tall properties can also be triggered:</p>
\t\t\t<h2>Option A — REST endpoint (usable from a host cron)</h2>
\t\t\t<pre><code>curl -s "${esc(addQueryArg({ token: token(c) }, endpoint))}"</code></pre>
\t\t\t<h2>Last run</h2>
\t\t\t`;
  if (last) {
    const errors: string[] = Array.isArray(last.errors) ? last.errors : Object.values(last.errors ?? {});
    o += `\t\t\t\t<p>${esc(last.time)} — checked ${phpInt(last.checked)} properties,
\t\t\t\t\t${phpInt(last.updated)} updated${errors.length ? ", errors: " + esc(errors.join("; ")) : ", no errors"}.</p>
\t\t\t`;
  } else {
    o += `\t\t\t\t<p>Never run yet.</p>
\t\t\t`;
  }
  const runUrl = esc(addQueryArg({ _wpnonce: nonce("at_run_check") }, addQueryArg({ at_run_check: 1 }, requestUri(c)).replace(/&amp;/g, "&")));
  o += `\t\t\t<p><a href="${escUrl(runUrl)}" class="button">Run check now</a></p>
\t\t\t`;
  if (query(c).at_run_check !== undefined) {
    const r = await run(c);
    o += '<div class="notice notice-success"><p>Checked ' + r.checked + " properties; " + r.updated.length + " updated.</p></div>";
  }
  return o + "\t\t</div>\n\t\t";
}

/** profile_fields( $user ): the address field on a user's profile (staff, or the user themselves). */
export async function profileFields(c: Ctx, user: User): Promise<string> {
  if (!can(c, "edit_users") && c.uid !== user.ID) return "";
  const p = await getProperty(c, user.ID);
  let o = `\t\t<h2>Aerial Timelapse</h2>
\t\t<table class="form-table">
\t\t\t<tr>
\t\t\t\t<th><label for="at_address">Property address</label></th>
\t\t\t\t<td>
\t\t\t\t\t<input type="text" id="at_address" name="at_address" class="regular-text"
\t\t\t\t\t\tvalue="${esc(p?.address ?? "")}"
\t\t\t\t\t\tplaceholder="123 Main St, City, ST 12345" />
\t\t\t\t\t<p class="description">
\t\t\t\t\t\t`;
  if (p) {
    const frames: any[] = Array.isArray(p.frames) ? p.frames : Object.values(p.frames ?? {});
    o += `\t\t\t\t\t\t\t${frames.length} frames saved
\t\t\t\t\t\t\t(${esc(frames[0]?.date)} →
\t\t\t\t\t\t\t${esc(frames[frames.length - 1]?.date)}).
\t\t\t\t\t\t\tChanging the address rebuilds the timelapse; clearing it removes it.
\t\t\t\t\t\t`;
  } else {
    o += `\t\t\t\t\t\t\tSaving an address geocodes it and downloads all historical NAIP aerial frames.
\t\t\t\t\t\t`;
  }
  return o + `\t\t\t\t\t</p>
\t\t\t\t</td>
\t\t\t</tr>
\t\t</table>
\t\t`;
}

/** save_profile( $user_id ) (personal_options_update / edit_user_profile_update). */
export async function saveProfile(c: Ctx, uid: number, post: Record<string, string | string[]>): Promise<void> {
  if (post.at_address === undefined || !can(c, "edit_user", uid)) return;
  const address = sanitizeTextField(Array.isArray(post.at_address) ? "Array" : post.at_address);
  const p = await getProperty(c, uid);
  if (address === "") {
    if (p) await deleteProperty(c, uid);
    return;
  }
  if (p && String(p.address).toLowerCase() === address.toLowerCase()) return;
  const r = await buildProperty(c, uid, address);
  if (isAtError(r)) await setTransient(c.env, "at_admin_error_" + c.uid, JSON.stringify(r.message), 60);
}

/** notices() (admin_notices): the last profile save's error, once. */
export async function notices(c: Ctx): Promise<string> {
  const raw = await getTransient(c.env, "at_admin_error_" + c.uid);
  const e = raw === null ? "" : String(JSON.parse(raw));
  if (!e) return "";
  await deleteTransient(c.env, "at_admin_error_" + c.uid);
  return '<div class="notice notice-error"><p>Aerial Timelapse: ' + esc(e) + "</p></div>";
}
