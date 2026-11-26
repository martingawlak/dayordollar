/**
 * The plugin's shortcodes by tag, and do_shortcode() for the page layouts.
 * Each area's port registers its own tags here.
 */
import type { Ctx } from "../ctx";
import * as H from "./home";
import * as AC from "./account";
import { gardenInvite } from "./garden";
import { start } from "../forms/consent";

export type Atts = Record<string, string>;
export type Shortcode = (c: Ctx, atts: Atts, content?: string) => string | Promise<string>;

export const SHORTCODES: Record<string, Shortcode> = {
  gff_zora_display: H.zoraDisplay,
  gff_express_start: H.expressStart,
  gff_express_email: H.expressEmail,
  gff_consult: H.consult,
  gff_agreement: H.agreement,
  gff_express_submit: H.expressSubmit,
  gff_form_end: H.formEnd,
  gff_convince: H.convince,
  gff_login: H.login,
  gff_account: AC.account,
  gff_my_farm: AC.myFarm,
  gff_account_planner: AC.accountPlanner,
  gff_farm_builder: AC.farmBuilder,
  gff_garden_invite: gardenInvite,
  gff_start: start,
};

/** shortcode_parse_atts() for the forms the pages use: name="v", name='v', name=v. */
export function parseAtts(s: string): Atts {
  const out: Atts = {};
  for (const m of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/**
 * do_shortcode(): registered tags left to right; unknown tags stay as text,
 * and nothing inside an HTML comment runs (WordPress leaves comments alone).
 */
export async function doShortcodes(c: Ctx, content: string): Promise<string> {
  let out = "";
  let last = 0;
  const re = /<!--[\s\S]*?-->|\[([a-z_]+)([^\]]*)\]/g;
  for (const m of content.matchAll(re)) {
    if (!m[1] || !SHORTCODES[m[1]]) continue;
    out += content.slice(last, m.index) + (await SHORTCODES[m[1]](c, parseAtts(m[2])));
    last = m.index! + m[0].length;
  }
  return out + content.slice(last);
}
