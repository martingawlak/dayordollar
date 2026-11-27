/**
 * The plugin's wp-admin screens on the Worker, at the addresses WordPress
 * gave them (so the plugin's own links keep working), plus /admin:
 *
 *   /admin, /wp-admin/admin.php?page=fppm-settings   Purple Martins → Settings (manage_options)
 *   /wp-admin/admin.php?page=fppm-waivers            Purple Martins → Waivers (manage_options)
 *   /wp-admin/tools.php?page=gff-drive-backup        Tools → GFF Drive Backup (manage_options); POST runs it now
 *   POST /wp-admin/options.php                       saves a settings group
 *
 * Administrators only, as on WordPress. wp-admin's own frame does not exist
 * here: the plugin's markup is shown inside a small standalone page.
 */
import type { Env } from "./env";
import { can, makeCtx } from "./ctx";
import { currentUserId, sameOrigin } from "./session";
import type { AjaxCtx } from "./ajax";
import { DieReply } from "./wp";
import { dbkSettingsPage, saveSettings, settingsPage } from "./fppm/settings";
import { waiversPage } from "./fppm/waivers";

const CSS = `body{margin:0;background:#f0f0f1;color:#3c434a;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.fppm-admin-bar{background:#1d2327;color:#f0f0f1;padding:8px 20px}.fppm-admin-bar a{color:#72aee6;margin-right:14px}
.wrap{max-width:1200px;margin:10px 20px 40px}
h1{font-size:23px;font-weight:400;margin:0;padding:9px 0 4px}h2{font-size:1.3em;margin:1.4em 0 .6em}
.form-table{border-collapse:collapse;width:100%;margin-top:.5em}.form-table th{width:200px;padding:20px 10px 20px 0;text-align:left;vertical-align:top;font-weight:600}.form-table td{padding:15px 10px;vertical-align:middle}
.regular-text{width:25em}.large-text{width:99%}.small-text{width:50px}.description{color:#646970}code{background:rgba(0,0,0,.07);padding:3px 5px;font-size:13px}
input[type=text],input[type=email],input[type=url],input[type=password],input[type=number],select,textarea{border:1px solid #8c8f94;border-radius:4px;padding:0 8px;min-height:30px;font:inherit;box-sizing:border-box;max-width:100%}
.button{display:inline-block;min-height:30px;padding:0 10px;border:1px solid #2271b1;border-radius:3px;background:#f6f7f7;color:#2271b1;font:inherit;line-height:2.15;cursor:pointer;text-decoration:none}
.button-primary{background:#2271b1;color:#fff}
.widefat{border:1px solid #c3c4c7;border-spacing:0;width:100%;background:#fff}.widefat th,.widefat td{padding:8px 10px;text-align:left;vertical-align:top}.striped>tbody>:nth-child(odd){background:#f6f7f7}
.notice{background:#fff;border:1px solid #c3c4c7;border-left-width:4px;margin:5px 0 15px;padding:1px 12px}.notice-success{border-left-color:#00a32a}.notice-error{border-left-color:#d63638}.notice-info{border-left-color:#72aee6}.notice-warning{border-left-color:#dba617}`;

function frame(title: string, body: string, status = 200): Response {
  const html = '<!DOCTYPE html>\n<html lang="en-US"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + "<title>" + title + " ‹ FPPM</title><style>" + CSS + "</style></head><body>"
    + '<div class="fppm-admin-bar"><a href="/wp-admin/admin.php?page=fppm-settings">Settings</a><a href="/wp-admin/admin.php?page=fppm-waivers">Waivers</a><a href="/wp-admin/tools.php?page=gff-drive-backup">Drive backup</a><a href="/account/">Account page</a><a href="/auth/logout">Sign out</a></div>'
    + body + "</body></html>";
  return new Response(html, { status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-frame-options": "DENY" } });
}
const denied = (msg: string) => frame("Error", '<div class="wrap"><p>' + msg + "</p></div>", 403);
const SAVED = '<div class="notice notice-success"><p><strong>Settings saved.</strong></p></div>';

export async function adminRoute(env: Env, req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname, page = url.searchParams.get("page") ?? "";
  const screen = path === "/admin" || path === "/admin/" ? "settings"
    : path === "/wp-admin/admin.php" && page === "fppm-settings" ? "settings"
    : path === "/wp-admin/admin.php" && page === "fppm-waivers" ? "waivers"
    : path === "/wp-admin/tools.php" && page === "gff-drive-backup" ? "drive"
    : path === "/wp-admin/options.php" ? "options" : "";
  if (!screen) return null;
  const uid = await currentUserId(env, req);
  if (!uid) return Response.redirect(new URL("/auth/login?returnTo=" + encodeURIComponent(path + url.search), req.url).toString(), 302);
  if (req.method === "POST" && !sameOrigin(req)) return denied("The link you followed has expired.");
  const post: Record<string, string> = {};
  if (req.method === "POST") {
    const form = await req.formData().catch(() => new FormData());
    for (const [k, v] of form.entries()) if (typeof v === "string") post[k] = v;
  }
  const c0 = await makeCtx(env, uid, path + url.search);
  const c = Object.assign(c0, { post, get: Object.fromEntries(url.searchParams), ip: req.headers.get("cf-connecting-ip") ?? "", files: {}, referer: req.headers.get("referer") ?? "" }) as AjaxCtx & { referer: string };
  if (!can(c, "manage_options")) return denied("Sorry, you are not allowed to access this page.");
  if (screen === "options") {
    if (req.method !== "POST") return Response.redirect(new URL("/wp-admin/admin.php?page=fppm-settings", req.url).toString(), 302);
    const r = await saveSettings(c);
    return r instanceof DieReply ? denied(r.message) : r.toResponse();
  }
  const saved = url.searchParams.get("settings-updated") === "true" ? SAVED : "";
  if (screen === "settings") return frame("Purple Martins Settings", saved + settingsPage(c));
  if (screen === "waivers") return frame("Waivers", await waiversPage(c));
  return frame("GFF Drive Backup", saved + (await dbkSettingsPage(c)));
}
