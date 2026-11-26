/** The render parity cases: plugin expressions and their Worker ports. */
import type { Ctx } from "../src/ctx";
import * as H from "../src/render/home";
import * as K from "../src/forms/catalog";
import { alert } from "../src/forms/express";

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
  {
    name: "catalogues and prices",
    php: ["gff_reg_crops()", "gff_reg_addons()", "gff_reg_bundle()", "gff_v33_offers()", "gff_reg_agreement_version()", "gff_reg_consult_amount()",
      "gff_reg_reservation_meta('consult')", "gff_reg_reservation_meta('down_payment')", "gff_reg_reservation_meta('workshop')", "gff_reg_reservation_meta('none')", "gff_reg_reservation_meta('x')",
      "gff_reg_paypal_payment_url()", "gff_reg_paypal_payment_url('250')"],
    ts: [() => JSON.stringify(K.crops()), () => JSON.stringify(K.addons()), () => JSON.stringify(K.bundle()), () => JSON.stringify(K.offers()), K.agreementVersion, K.consultAmount,
      ...["consult", "down_payment", "workshop", "none", "x"].map((o) => (c: Ctx) => JSON.stringify(K.reservationMeta(c, o))),
      (c) => K.paypalPaymentUrl(c), (c) => K.paypalPaymentUrl(c, "250")],
  },
  {
    name: "paypal.me link", options: { gff_reg_paypal_link: "https://www.paypal.me/gawlak/ x" },
    php: ["gff_reg_paypal_link()", "gff_reg_paypal_payment_url('25 0')", "gff_reg_reservation_meta('down_payment')"],
    ts: [K.paypalLink, (c) => K.paypalPaymentUrl(c, "25 0"), (c) => JSON.stringify(K.reservationMeta(c, "down_payment"))],
  },
  { name: "alerts", php: ["gff_reg_alert('success', '<b>ok</b>')", "gff_reg_alert('error', 'x')", "gff_reg_alert('other', '')"], ts: [() => alert("success", "<b>ok</b>"), () => alert("error", "x"), () => alert("other", "")] },
  { name: "three sisters", php: ["gff_reg_three_sisters_field()", "gff_reg_three_sisters_field(true)"], ts: [() => H.threeSistersField(), () => H.threeSistersField(true)] },
];
