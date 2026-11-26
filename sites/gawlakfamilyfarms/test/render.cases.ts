/** The render parity cases: plugin expressions and their Worker ports. */
import type { Ctx } from "../src/ctx";
import * as H from "../src/render/home";

export interface Case {
  name: string;
  uid?: number;
  permalink?: string;
  options?: Record<string, unknown>;
  meta?: [number, string, unknown][];
  php: string[];
  ts: ((c: Ctx) => Promise<string> | string)[];
  checkAssets?: boolean;
}

/** PHP: set $gff_reg_state fields first (a failed submit's notice and refill values). */
const state = (php: string) => `((function(){ global $gff_reg_state; ${php} })() ?? '')`;
const people = [0, 1, 4, 29, 30];
const nasty = "Tom & \"Jerry\" <b>'s</b> &amp;";

export const CASES: Case[] = [
  { name: "assets", php: ["run_hook('wp_enqueue_scripts')"], ts: [(c) => { H.registerAssets(c); return ""; }], checkAssets: true },
  { name: "css and js", php: ["gff_reg_css()", "gff_reg_font_overrides()", "gff_reg_validation_js()"], ts: [H.regCss, H.fontOverrides, H.validationJs] },
  ...people.map((uid) => ({ name: `zora display u${uid}`, uid, php: ["do_shortcode('[gff_zora_display]')"], ts: [(c: Ctx) => H.zoraDisplay(c)] })),
  // The express form: opens once, closes once; the notice prints at the start and at the end.
  ...people.map((uid) => ({
    name: `express form u${uid}`, uid,
    php: ["gff_sc_express_start()", "gff_sc_express_start()", "gff_sc_express_email()", "gff_sc_consult()", "gff_sc_agreement()", "gff_sc_express_submit()", "gff_sc_form_end()", "gff_sc_form_end()"],
    ts: [H.expressStart, H.expressStart, H.expressEmail, H.consult, H.agreement, H.expressSubmit, H.formEnd, H.formEnd],
  })),
  {
    name: "express form after a failed submit",
    php: [state("$gff_reg_state['notice'] = '<div id=\"gff-alert\">x</div>'; $gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_express_email' => " + JSON.stringify(nasty).replace(/\$/g, "\\$") + ", 'gff_agree' => 'yes'];"),
      "gff_sc_express_start()", "gff_sc_express_email()", "gff_sc_agreement()", "gff_sc_form_end()"],
    ts: [(c) => { c.reg.notice = '<div id="gff-alert">x</div>'; c.reg.repop = true; c.reg.old = { gff_express_email: nasty, gff_agree: "yes" }; return ""; },
      H.expressStart, H.expressEmail, H.agreement, H.formEnd],
  },
  {
    name: "refill edge cases",
    php: [state("$gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_express_email' => '0', 'gff_agree' => ['yes']];"), "gff_sc_express_email()", "gff_sc_agreement()",
      state("$gff_reg_state['repop'] = false; $gff_reg_state['old'] = ['gff_express_email' => 'a@b.co', 'gff_agree' => 'yes'];"), "gff_sc_express_email()", "gff_sc_agreement()",
      state("$gff_reg_state['repop'] = true; $gff_reg_state['old'] = ['gff_agree' => 'no'];"), "gff_sc_agreement()"],
    ts: [(c) => { c.reg.repop = true; c.reg.old = { gff_express_email: "0", gff_agree: ["yes"] }; return ""; }, H.expressEmail, H.agreement,
      (c) => { c.reg.repop = false; c.reg.old = { gff_express_email: "a@b.co", gff_agree: "yes" }; return ""; }, H.expressEmail, H.agreement,
      (c) => { c.reg.repop = true; c.reg.old = { gff_agree: "no" }; return ""; }, H.agreement],
  },
  {
    name: "shortcode attributes",
    php: [`do_shortcode('[gff_express_email legend="Hold it" label="Email please"]')`, `do_shortcode('[gff_consult legend="A & B"]')`, `do_shortcode('[gff_express_submit label="Go <now>"]')`,
      `do_shortcode('[gff_convince]')`, `do_shortcode('[gff_convince open="YES" label="Why?"]')`, `do_shortcode('[gff_convince open="no"]')`],
    ts: [(c) => H.expressEmail(c, { legend: "Hold it", label: "Email please" }), (c) => H.consult(c, { legend: "A & B" }), (c) => H.expressSubmit(c, { label: "Go <now>" }),
      (c) => H.convince(c), (c) => H.convince(c, { open: "YES", label: "Why?" }), (c) => H.convince(c, { open: "no" })],
  },
  { name: "three sisters", php: ["gff_reg_three_sisters_field()", "gff_reg_three_sisters_field(true)"], ts: [() => H.threeSistersField(), () => H.threeSistersField(true)] },
];
