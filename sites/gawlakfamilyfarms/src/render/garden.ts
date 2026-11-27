/**
 * [gff_garden_invite] (the garden page): a customer opens their emailed link
 * (?g=<user>&t=<token>) and designs their garden with the farm builder; a
 * posted layout is saved and the owner told. Ported line for line; checked by
 * test/render.parity.ts. (Sending the invite, gff_send_garden_invite, is the
 * client admin's.)
 */
import { type Ctx, loadUser, meta, opt, setMeta } from "../ctx";
import { hmacMd5 } from "../md5";
import { esc, phpInt, phpJson } from "../php";
import { isEmail, sanitizeTextField } from "../wpfn";
import { sendMail } from "../wp";
import { offers } from "../forms/catalog";
import { parseLayout, str } from "../forms/express";
import { acctStyles, customerOffer, farmBuilder, nonceField, postOf } from "./account";
import type { Atts } from "./home";

/** wp_hash( $data ): HMAC-MD5 with wp_salt( 'auth' ) (the Worker secret WP_AUTH_SALT). */
export const wpHash = (c: Ctx, data: string) => hmacMd5(data, c.env.WP_AUTH_SALT ?? "");

/** hash_equals() */
const hashEquals = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

/** gff_garden_token_ok( $uid, $tok ): the link's token matches the stored hash and has not expired. */
export async function gardenTokenOk(c: Ctx, uid: number, tok: string): Promise<boolean> {
  if (tok === "") return false;
  const stored = str(await meta(c, uid, "gff_garden_token"));
  const exp = phpInt(await meta(c, uid, "gff_garden_token_exp"));
  if (stored === "" || !exp || c.now > exp) return false;
  return hashEquals(stored, wpHash(c, tok));
}

/** gff_garden_notify_owner( $uid, $flat ) */
export async function gardenNotifyOwner(c: Ctx, uid: number, flat: string[]): Promise<void> {
  const user = await loadUser(c.env, uid);
  if (!user) return;
  let to = str(opt(c, "gff_reg_msg_recipient", "martingawlak@gmail.com"));
  if (!isEmail(to)) to = "martingawlak@gmail.com";
  let name = (str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name"))).trim();
  if (name === "") name = user.display_name;
  const list = flat.map((x) => esc(x)).join(", ");
  let body = "<p><strong>" + esc(name) + "</strong> saved their Zora custom garden via the invite link.</p>";
  body += "<p><strong>Plants:</strong> " + list + "</p><p>Email: " + esc(user.user_email) + "</p>";
  await sendMail(c.env, to, "Garden chosen: " + name, body, ["Content-Type: text/html; charset=UTF-8"]);
}

/** The request's query string ($_GET). */
const getOf = (c: Ctx): Record<string, string | string[]> => ((c as Ctx & { get?: Record<string, string | string[]> }).get ?? {});
const gstr = (q: Record<string, string | string[]>, k: string) => { const v = q[k]; return v === undefined ? "" : Array.isArray(v) ? "Array" : v; };

/** [gff_garden_invite] */
export async function gardenInvite(c: Ctx, _atts: Atts = {}): Promise<string> {
  const q = getOf(c);
  const uid = q.g !== undefined ? phpInt(gstr(q, "g")) : 0;
  const tok = q.t !== undefined ? sanitizeTextField(gstr(q, "t")) : "";
  if (!uid || !(await gardenTokenOk(c, uid, tok))) {
    return '<div class="gff-acct"><div class="gff-acct__card"><p class="gff-acct__sub">This garden link is invalid or has expired. Please ask Gawlak Family Farms for a fresh link.</p></div></div>' + acctStyles();
  }
  const user = await loadUser(c.env, uid);
  let name = (str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name"))).trim();
  if (name === "") name = user ? user.display_name : "there";

  const post = postOf(c);
  let notice = "";
  if (post.gff_garden_nonce !== undefined) {
    const parsed = parseLayout(post.gff_farm_layout ?? "");
    if (parsed && parsed.flat.length) {
      await setMeta(c, uid, "gff_farm_layout", phpJson(parsed.layout));
      await setMeta(c, uid, "gff_crops_wanted", parsed.flat);
      await setMeta(c, uid, "gff_moringa_fruit_upgrade", parsed.moringa_upgrade ? "yes" : "no");
      const chosen = parsed.layout.offer !== undefined ? parsed.layout.offer : "";
      if (offers().includes(chosen)) await setMeta(c, uid, "gff_offer", chosen);
      await gardenNotifyOwner(c, uid, parsed.flat);
      notice = '<div class="gff-acct__notice gff-acct__notice--ok">Your garden is saved &#127793; We&rsquo;ll plant it on our next visit. You can adjust it any time from this link.</div>';
    } else {
      notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please add at least one plant to a spot, then save again.</div>';
    }
  }
  const offer = await customerOffer(c, uid);
  const mode = offer === "sunrise" || offer === "spire" ? offer : "both";
  const lead = mode === "both"
    ? "pick your garden style &mdash; a <b>&#127749; Sunrise seasonal bed</b> or <b>&#9889; Spire towers</b> &mdash; then choose your plants and save. We plant exactly what you choose on our next visit."
    : "choose what you&rsquo;d like growing, fill your spots, then save. We plant exactly what you pick on our next visit.";
  return `\t<div class="gff-acct">
\t\t<h2 class="gff-acct__title">&#127749; Your Zora Custom Garden</h2>
\t\t<p class="gff-acct__lead">Hi ${esc(name)} &mdash; ${lead}</p>
\t\t${notice}\t\t<div class="gff-acct__card">
\t\t\t<form method="post">
\t\t\t\t${nonceField(c, "gff_garden_" + uid, "gff_garden_nonce")}\t\t\t\t${await farmBuilder(c, { mode: esc(mode), user: String(uid) })}\t\t\t\t<button type="submit" class="gff-acct__btn">Save my garden</button>
\t\t\t</form>
\t\t</div>
\t</div>
\t<script>
\t(function(){
\t\tdocument.querySelectorAll('.gff-fb-enable').forEach(function(cb){ if(!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } });
\t})();
\t</script>
\t` + acctStyles();
}
