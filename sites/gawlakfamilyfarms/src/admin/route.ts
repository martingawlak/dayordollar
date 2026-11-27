/**
 * The client admin's screens on the Worker, at the addresses WordPress gave
 * them (so the plugin's own links keep working), plus /admin:
 *
 *   /admin, /wp-admin/admin.php?page=gff-clients   GFF Clients     (list_users)
 *   /wp-admin/admin.php?page=gff-settings          GFF Settings    (manage_options); POST /wp-admin/options.php saves it
 *   /wp-admin/tools.php?page=gff-drive-backup     GFF Drive Backup (manage_options); POST runs a backup now, options.php saves it
 *   /wp-admin/user-edit.php?user_id=N              a user's profile: the plugin's panels (edit_users; one's own phone always)
 *   /wp-admin/profile.php                          one's own profile
 *
 * wp-admin's frame (menus, the core profile fields) does not exist here: the
 * plugin's own markup is shown inside a small standalone page with a style
 * block standing in for wp-admin's look. A profile save runs only the
 * plugin's update hooks (WordPress's own fields — name, email, password —
 * belong to the shared accounts service now) and returns to the profile with
 * updated=1, as user-edit.php did. POSTs must come from this site (sameOrigin).
 */
import type { Env } from "../env";
import { escUrl } from "../php";
import { loadUser, makeCtx } from "../ctx";
import { currentUserId, sameOrigin } from "../session";
import type { AdminCtx } from "./core";
import { can } from "./core";
import { clientsPage, profilePanels, settingsPage } from "./views";
import { dbkSettingsPage } from "./drive";
import { profileSave, saveSettings } from "./posts";

const CSS = `body{margin:0;background:#f0f0f1;color:#3c434a;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.gff-admin-bar{background:#1d2327;color:#f0f0f1;padding:8px 20px}.gff-admin-bar a{color:#72aee6;margin-right:14px}
.wrap,.gff-admin-body{max-width:1200px;margin:10px 20px 40px}
h1{font-size:23px;font-weight:400;margin:0;padding:9px 0 4px}h2{font-size:1.3em;margin:1.4em 0 .6em}
.form-table{border-collapse:collapse;width:100%;margin-top:.5em}.form-table th{width:200px;padding:20px 10px 20px 0;text-align:left;vertical-align:top;font-weight:600}.form-table td{padding:15px 10px;vertical-align:middle}
.regular-text{width:25em}.large-text{width:99%}.description{color:#646970}
input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],input[type=date],select,textarea{border:1px solid #8c8f94;border-radius:4px;padding:0 8px;min-height:30px;font:inherit;box-sizing:border-box}
.button{display:inline-block;min-height:30px;padding:0 10px;border:1px solid #2271b1;border-radius:3px;background:#f6f7f7;color:#2271b1;font:inherit;line-height:2.15;cursor:pointer;text-decoration:none}
.button-primary{background:#2271b1;color:#fff}.button-small{min-height:26px;line-height:2.18;padding:0 8px;font-size:11px}
.widefat{border:1px solid #c3c4c7;border-spacing:0;width:100%;background:#fff}.widefat th,.widefat td{padding:8px 10px;text-align:left;vertical-align:top}.striped>tbody>:nth-child(odd){background:#f6f7f7}
.notice{background:#fff;border:1px solid #c3c4c7;border-left-width:4px;margin:5px 0 15px;padding:1px 12px}.notice-success{border-left-color:#00a32a}.notice-error{border-left-color:#d63638}.notice-info{border-left-color:#72aee6}`;

function frame(title: string, body: string, status = 200): Response {
  const html = '<!DOCTYPE html>\n<html lang="en-US"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + "<title>" + title + " ‹ Gawlak Family Farms</title><style>" + CSS + "</style></head><body>"
    + '<div class="gff-admin-bar"><a href="/wp-admin/admin.php?page=gff-clients">GFF Clients</a><a href="/wp-admin/admin.php?page=gff-settings">Settings</a><a href="/account/">Account page</a><a href="/auth/logout">Sign out</a></div>'
    + body + "</body></html>";
  return new Response(html, { status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-frame-options": "DENY" } });
}
const denied = (msg: string) => frame("Error", '<div class="gff-admin-body"><p>' + msg + "</p></div>", 403);

/** The client admin's screens; null when the path is not one of them. */
export async function adminRoute(env: Env, req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname, page = url.searchParams.get("page") ?? "";
  const screen = path === "/admin" || path === "/admin/" ? "clients"
    : path === "/wp-admin/admin.php" && page === "gff-clients" ? "clients"
    : path === "/wp-admin/admin.php" && page === "gff-settings" ? "settings"
    : path === "/wp-admin/options.php" ? "options"
    : path === "/wp-admin/tools.php" && page === "gff-drive-backup" ? "drive"
    : path === "/wp-admin/user-edit.php" ? "user" : path === "/wp-admin/profile.php" ? "profile" : "";
  if (!screen) return null;
  const uid = await currentUserId(env, req);
  if (!uid) return Response.redirect(new URL("/auth/login?returnTo=" + encodeURIComponent(path + url.search), req.url).toString(), 302);
  if (req.method === "POST" && !sameOrigin(req)) return denied("The link you followed has expired.");
  const post: Record<string, string | string[]> = {};
  if (req.method === "POST") {
    const form = await req.formData().catch(() => new FormData());
    for (const [k, v] of form.entries()) {
      if (typeof v !== "string") continue;
      if (k.endsWith("[]")) ((post[k.slice(0, -2)] ??= []) as string[]).push(v); else post[k] = v;
    }
  }
  const c0 = await makeCtx(env, uid, path + url.search);
  const c: AdminCtx = Object.assign(c0, { post, get: Object.fromEntries(url.searchParams), ip: req.headers.get("cf-connecting-ip") ?? "0", files: {}, referer: req.headers.get("referer") ?? "" });
  (c as AdminCtx & { requestUri?: string }).requestUri = path + url.search;

  if (screen === "options") {
    if (req.method !== "POST") return Response.redirect(new URL("/wp-admin/admin.php?page=gff-settings", req.url).toString(), 302);
    return (await saveSettings(c)).toResponse();
  }
  if (screen === "clients") {
    const r = await clientsPage(c);
    return typeof r === "string" ? frame("GFF Clients", r) : denied(r.die);
  }
  if (screen === "drive") {
    if (!can(c, "manage_options")) return denied("Sorry, you are not allowed to access this page.");
    const saved = url.searchParams.get("settings-updated") === "true" ? '<div class="notice notice-success"><p><strong>Settings saved.</strong></p></div>' : "";
    return frame("GFF Drive Backup", saved + await dbkSettingsPage(c));
  }
  if (screen === "settings") {
    if (!can(c, "manage_options")) return denied("Sorry, you are not allowed to access this page.");
    const saved = url.searchParams.get("settings-updated") === "true" ? '<div class="notice notice-success"><p><strong>Settings saved.</strong></p></div>' : "";
    return frame("GFF Settings", saved + settingsPage(c));
  }
  // A profile: one's own (profile.php), or another user's (user-edit.php, edit_users).
  const target = screen === "profile" ? uid : Number(url.searchParams.get("user_id")) || 0;
  if (!can(c, "edit_user", target)) return denied("Sorry, you are not allowed to edit this user.");
  const user = await loadUser(env, target);
  if (!user) return denied("Invalid user ID.");
  if (req.method === "POST") {
    await profileSave(c, target);
    return Response.redirect(new URL((screen === "profile" ? "/wp-admin/profile.php?" : "/wp-admin/user-edit.php?user_id=" + target + "&") + "updated=1", req.url).toString(), 302);
  }
  const updated = url.searchParams.get("updated") ? '<div class="notice notice-success"><p><strong>User updated.</strong></p></div>' : "";
  const action = screen === "profile" ? "/wp-admin/profile.php" : "/wp-admin/user-edit.php?user_id=" + target;
  return frame("Edit user", '<div class="wrap"><h1>' + (screen === "profile" ? "Profile" : "Edit User") + "</h1>" + updated
    + '<form method="post" action="' + escUrl(action) + '">' + (await profilePanels(c, user))
    + '<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" value="Update ' + (screen === "profile" ? "Profile" : "User") + '"  /></p></form></div>');
}
