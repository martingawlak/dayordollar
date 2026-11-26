/**
 * The frictionless start (§34): [gff_start] — one checkbox, one button — and
 * wp_ajax(_nopriv)_gff_v34_consent, which records the agreement before the
 * visitor goes to PayPal: on their user if signed in, else under a random
 * token (a transient plus the gff_consent_queue setting), claimed when an
 * account is created. Ported line for line; checked by the benches.
 *
 * [gff_start]'s note went through wp_kses_post(); it comes from the page's own
 * shortcode attributes (the site's content, not a visitor's), so it is printed
 * as given, as the test stand-in does.
 */
import { type AjaxCtx, p, type Reply, success } from "../ajax";
import { type Ctx, opt, setMeta, setOpt } from "../ctx";
import { esc } from "../php";
import { sanitizeKey, sanitizeTextField } from "../wpfn";
import { getTransient, deleteTransient, randomCode, setTransient } from "../wp";
import { currentMysql } from "../wpcore";
import { agreementVersion, offers } from "./catalog";
import { isArr, notEmpty } from "./express";
import { type Atts, fill, shortcodeAtts } from "../render/home";
import { START_T } from "../render/templates.gen";

export const v34PaypalUrl = () => "https://www.paypal.com/ncp/payment/XJYNQSNDSDE5S";
export const v34Consult = () => "250";

/** [gff_start offer="sunrise|spire|both" label note] */
export function start(c: Ctx, atts: Atts = {}): string {
  const a = shortcodeAtts({
    offer: "",
    label: "Start — $" + v34Consult(),
    note: "Credited in full toward your $772 start. We&rsquo;ll call within 24 hours to book your consult.",
  }, atts);
  const offer = offers().includes(a.offer) ? a.offer : "";
  return fill(START_T, { LABEL: esc(a.label), NOTE: a.note, OFFER: esc(offer) });
}

/** The visitor's address ($_SERVER['REMOTE_ADDR']). */
const clientIp = (c: AjaxCtx) => sanitizeTextField(c.ip ?? "");

/** gff_v34_queue_add( $token, $record ): the unmatched-consent queue, the newest 200. */
async function queueAdd(c: Ctx, token: string, record: Record<string, unknown>): Promise<void> {
  const v = opt(c, "gff_consent_queue", []);
  let q: Record<string, unknown> = isArr(v) ? Object.assign({}, v) : {};
  q[token] = record;
  const keys = Object.keys(q);
  if (keys.length > 200) q = Object.fromEntries(keys.slice(-200).map((k) => [k, q[k]]));
  await setOpt(c, "gff_consent_queue", q);
}

/** gff_v34_queue_claim( $user_id, $token ): move a parked consent onto the new account. */
export async function queueClaim(c: Ctx, uid: number, token: string): Promise<boolean> {
  const raw = await getTransient(c.env, "gff_consent_" + token);
  const record: any = raw === null ? false : JSON.parse(raw);
  if (!notEmpty(record)) return false;
  await setMeta(c, uid, "gff_agree", "yes");
  await setMeta(c, uid, "gff_agree_record", record);
  await setMeta(c, uid, "gff_reservation", "consult");
  if (notEmpty(record.offer)) await setMeta(c, uid, "gff_offer", record.offer);
  await deleteTransient(c.env, "gff_consent_" + token);
  const v = opt(c, "gff_consent_queue", []);
  const q: Record<string, unknown> = isArr(v) ? Object.assign({}, v) : {};
  delete q[token];
  await setOpt(c, "gff_consent_queue", Object.keys(q).length ? q : []);
  return true;
}

/** wp_ajax(_nopriv)_gff_v34_consent */
export async function recordConsent(c: AjaxCtx): Promise<Reply> {
  let offer = sanitizeKey(p(c, "offer"));
  if (!offers().includes(offer)) offer = "";
  const record = {
    agreed: "yes",
    version: agreementVersion(),
    time: currentMysql(c),
    offer,
    ip: clientIp(c),
    user_agent: sanitizeTextField(c.ua ?? "").slice(0, 250),
  };
  if (c.uid) {
    await setMeta(c, c.uid, "gff_agree", "yes");
    await setMeta(c, c.uid, "gff_agree_record", record);
    await setMeta(c, c.uid, "gff_reservation", "consult");
    if (offer) await setMeta(c, c.uid, "gff_offer", offer);
    return success({ token: "" });
  }
  const token = randomCode(20);
  await setTransient(c.env, "gff_consent_" + token, JSON.stringify(record), 60 * 86400);
  await queueAdd(c, token, record);
  return success({ token });
}
