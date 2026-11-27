/**
 * Section 10c: the members-only site. Signed-out visitors are sent to the
 * join page (?fppm_gate=1) from every page but the public ones; a signed-in
 * person who has not finished joining (a bare Google sign-in) is sent to
 * /account/ until they have. Both ran on template_redirect (priorities 1 and
 * 2), i.e. for pages only — not admin-post.php, admin-ajax.php or the
 * ?fppm_pwa= / ?fppm_ics= endpoints, which answer earlier.
 */
import { type Ctx, homeUrl, opt } from "../ctx";
import { truthy } from "../php";
import { escUrlRaw, sanitizeTitleSave } from "../wpfn";
import { addQueryArg } from "../wp";
import { canManage, str, trim } from "./core";
import { memberComplete } from "./account";

/** A page of the site: its slug and the shortcodes its content holds (has_shortcode()). */
export interface PageInfo { slug: string; shortcodes: string[] }

export const gateEnabled = (c: Ctx) => str(opt(c, "fppm_login_gate", "1")) === "1";
export function joinUrl(c: Ctx): string {
  const u = trim(str(opt(c, "fppm_join_url", "")));
  return truthy(u) ? escUrlRaw(u) : homeUrl(c, "/go/");
}
export function publicPageSlugs(c: Ctx): string[] {
  const slugs = ["go", "join", "register", "invite", "login"];
  const extra = opt(c, "fppm_public_slugs", "");
  if (typeof extra === "string" && trim(extra) !== "") {
    for (const s0 of extra.split(",")) { const s = sanitizeTitleSave(trim(s0)); if (truthy(s)) slugs.push(s); }
  }
  return [...new Set(slugs)];
}
export function isPublicRequest(c: Ctx, page: PageInfo | null): boolean {
  if (c.get.fppm_pwa !== undefined) return true;
  if (page) {
    if (publicPageSlugs(c).includes(page.slug)) return true;
    if (page.shortcodes.includes("fppm_register") || page.shortcodes.includes("fppm_invite")) return true;
  }
  return false;
}
/** fppm_login_gate(): where a signed-out visitor goes instead, or null to show the page. */
export function loginGate(c: Ctx, page: PageInfo | null): string | null {
  if (!gateEnabled(c) || c.uid) return null;
  if (isPublicRequest(c, page)) return null;
  return addQueryArg({ fppm_gate: "1" }, joinUrl(c));
}
/** fppm_completion_gate(): /account/ for a signed-in person who has not finished joining, or null. */
export async function completionGate(c: Ctx, page: PageInfo | null): Promise<string | null> {
  if (!c.uid) return null;
  if ((await canManage(c, c.uid)) || (await memberComplete(c, c.uid))) return null;
  if (page && page.shortcodes.includes("fppm_account")) return null;
  return homeUrl(c, "/account/");
}
