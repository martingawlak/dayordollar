/**
 * The home page's shortcodes ([gff_zora_display], the express sign-up form
 * [gff_express_start] … [gff_express_submit] [gff_form_end], [gff_consult],
 * [gff_agreement], [gff_convince]) and the plugin's site-wide styles and
 * validation script. The fixed markup comes from the plugin itself
 * (scripts/gen-templates.php → templates.gen.ts); this file fills its holes
 * with the same values, escaped the same way. Checked by test/render.parity.ts.
 */
import type { Ctx } from "../ctx";
import { esc } from "../php";
import {
  AGREEMENT_T, CONSULT_T, CONVINCE_T, EXPRESS_EMAIL_T, EXPRESS_START_T, EXPRESS_SUBMIT_T, FONT_CSS, FORM_END_T, REG_CSS,
  THREE_SISTERS_T, VALIDATION_JS, ZORA_DISPLAY_T,
} from "./templates.gen";

export type Atts = Record<string, string>;

/** shortcode_atts( $pairs, $atts ): the known attributes, defaults for the missing ones. */
export function shortcodeAtts<T extends Record<string, string>>(pairs: T, atts: Atts = {}): T {
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(pairs)) out[k] = Object.prototype.hasOwnProperty.call(atts, k) ? atts[k] : d;
  return out as T;
}

/** Fill @@NAME@@ holes (split/join, so `$` in values is never special). */
export const fill = (tpl: string, vals: Record<string, string>) =>
  Object.entries(vals).reduce((s, [k, v]) => s.split("@@" + k + "@@").join(v), tpl);

/** gff_reg_register_assets() (wp_enqueue_scripts): the plugin's style, the brand fonts and the validation script, on every page. */
export function registerAssets(c: Ctx): void {
  const a = c.assets;
  a.styles["gff-reg"] = { src: false, ver: false }; // wp_register_style( 'gff-reg', false ): an inline-only handle
  (a.inline_styles["gff-reg"] ??= []).push(REG_CSS);
  a.styles["gff-fonts"] = { src: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Oswald:wght@500;600;700&display=swap", ver: null };
  a.inline_styles["gff-reg"].push(FONT_CSS);
  a.scripts["gff-reg-validation"] = { src: "", ver: "3.1.0" };
  (a.inline_scripts["gff-reg-validation"] ??= []).push(VALIDATION_JS);
}
/** gff_reg_css(), gff_reg_font_overrides(), gff_reg_validation_js(). */
export const regCss = () => REG_CSS;
export const fontOverrides = () => FONT_CSS;
export const validationJs = () => VALIDATION_JS;

/** [gff_zora_display] */
export const zoraDisplay = (_c: Ctx, _atts: Atts = {}) => ZORA_DISPLAY_T;

/** [gff_express_start]: opens the express form (once per page) with its nonce and the honeypot. */
export function expressStart(c: Ctx, _atts: Atts = {}): string {
  if (c.reg.form_open) return "";
  c.reg.form_open = true;
  return fill(EXPRESS_START_T, { NOTICE: c.reg.notice });
}

/** [gff_express_email]: the one required field of the express flow, refilled after a failed submit. */
export function expressEmail(c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({ legend: "Reserve your spot", label: "Your email" }, atts);
  const old = c.reg.old.gff_express_email;
  const val = c.reg.repop && old !== undefined && old !== null && old !== "" && old !== "0" ? ' value="' + esc(old) + '"' : "";
  return fill(EXPRESS_EMAIL_T, { VAL: val, LEGEND: esc(a.legend), LABEL: esc(a.label) });
}

/** [gff_consult] */
export function consult(_c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({ legend: "Your design consult" }, atts);
  return fill(CONSULT_T, { LEGEND: esc(a.legend) });
}

/** gff_reg_three_sisters_field( $spire_wrap ): the Propagation Program note (the same either way). */
export const threeSistersField = (_spireWrap = false) => THREE_SISTERS_T;

/** gff_reg_old_checked( $key, $match ): ' checked' if the failed submit had it. */
export function oldChecked(c: Ctx, key: string, match = "yes"): string {
  if (!c.reg.repop) return "";
  const v = c.reg.old[key] !== undefined && c.reg.old[key] !== null ? c.reg.old[key] : "";
  if (Array.isArray(v)) return v.includes(match) ? " checked" : "";
  return String(v) === String(match) ? " checked" : "";
}

/** [gff_agreement]: both agreements' sections (fixed text), the Propagation note and the accept box. */
export function agreement(c: Ctx, _atts: Atts = {}): string {
  return fill(AGREEMENT_T, { THREE_SISTERS: threeSistersField(true), CHECKED: oldChecked(c, "gff_agree", "yes") });
}

/** [gff_express_submit] */
export function expressSubmit(_c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({ label: "Reserve my spot" }, atts);
  return fill(EXPRESS_SUBMIT_T, { LABEL: esc(a.label) });
}

/** [gff_form_end]: closes the page's form (if one is open), with the submit notice. */
export function formEnd(c: Ctx, _atts: Atts = {}): string {
  if (!c.reg.form_open) return "";
  c.reg.form_open = false;
  return fill(FORM_END_T, { NOTICE: c.reg.notice });
}

/** [gff_convince] */
export function convince(_c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({ label: "Talk me into this.", open: "no" }, atts);
  return fill(CONVINCE_T, { LABEL: esc(a.label), OPEN: a.open.toLowerCase() === "yes" ? " open" : "" });
}

/**
 * [gff_login]: the plugin's "Create your login" fieldset held only the two
 * password fields. Sign-in is the shared accounts service (MIGRATION.md), so
 * the section has nothing left to show and prints nothing.
 */
export const login = (_c: Ctx, _atts: Atts = {}) => "";
