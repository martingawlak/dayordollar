/**
 * Section 10e and 10a-2: the in-plugin store — the catalog (fppm_store_catalog,
 * fetched from Printful), each member's discount, PayPal Orders API checkout
 * (create, capture) and the Printful order that follows; the store and merch
 * teaser markup; and Settings' "Fetch catalog from Printful".
 *
 * Credentials: the PayPal secret (fppm_pp_secret) and the Printful token
 * (fppm_printful_token) are the PAYPAL_SECRET and PRINTFUL_TOKEN Worker
 * secrets now; the PayPal client id stays a setting (the page prints it in
 * PayPal's script address anyway).
 */
import { type Ctx, adminUrl, getTransient, deleteTransient, setTransient, meta, opt, setMeta, setOpt, can, nonce } from "../ctx";
import { esc, escUrl, numberFormat, phpFloat, phpInt, phpJson, phpRound, rawurlencode, truthy } from "../php";
import { escUrlRaw, sanitizeTextField } from "../wpfn";
import { addQueryArg, currentMysql, DieReply, RedirectReply, sendMail } from "../wp";
import { type AjaxCtx, error, success, type Reply } from "../ajax";
import { collective, couponPercent, displayName, isArr, notifyEmail, priceTshirt, str, trim, typeOf } from "./core";
import { FPPM_STORE_HTML } from "./templates.gen";

class PError { constructor(public message: string) {} }
const isErr = (v: unknown): v is PError => v instanceof PError;

export const ppEnv = (c: Ctx) => (opt(c, "fppm_pp_env", "sandbox") === "live" ? "live" : "sandbox");
export const ppApiBase = (c: Ctx) => (ppEnv(c) === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
export const ppClientId = (c: Ctx) => trim(str(opt(c, "fppm_pp_client_id", "")));
export const ppSecret = (c: Ctx) => trim(c.env.PAYPAL_SECRET ?? "");
export const printfulToken = (c: Ctx) => trim(c.env.PRINTFUL_TOKEN ?? "");
export const printfulStoreId = (c: Ctx) => trim(str(opt(c, "fppm_printful_store_id", "")));
export function printfulHeaders(c: Ctx): Record<string, string> {
  const h: Record<string, string> = { Authorization: "Bearer " + printfulToken(c) };
  if (truthy(printfulStoreId(c))) h["X-PF-Store-Id"] = printfulStoreId(c);
  return h;
}
export const storeReady = (c: Ctx) => truthy(ppClientId(c)) && truthy(ppSecret(c)) && storeCatalog(c).length > 0;

/** fppm_tee_variants(): "M:1234" lines (the legacy tee-only field). */
export function teeVariants(c: Ctx): Record<string, number> {
  const map: Record<string, number> = {};
  for (let line of str(opt(c, "fppm_tee_variants", "")).split(/[\r\n,]+/)) {
    line = trim(line);
    if (line === "" || !line.includes(":")) continue;
    const i = line.indexOf(":");
    const sz = trim(line.slice(0, i)), id = trim(line.slice(i + 1));
    if (sz !== "" && id !== "" && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(id)) map[sz.toUpperCase()] = phpInt(id);
  }
  return map;
}
export interface Variant { label: string; id: number; price: number; img?: string }
export interface Product { name: string; img?: string; variants: Variant[] }
/** fppm_store_catalog(): the products and variants offered, from the JSON setting (or the legacy tee field). */
export function storeCatalog(c: Ctx): Product[] {
  const products: Product[] = [];
  const raw = opt(c, "fppm_store_catalog", "");
  let data: unknown = null;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = null; } } else data = raw;
  if (isArr(data)) {
    for (const p of Object.values(data)) {
      if (!isArr(p) || !truthy(p.name) || !truthy(p.variants) || !isArr(p.variants)) continue;
      const vs: Variant[] = [];
      for (const v of Object.values(p.variants) as any[]) {
        if (!isArr(v) || !truthy(v.id) || v.price === undefined || v.price === null) continue;
        vs.push({ label: sanitizeTextField(v.label !== undefined && v.label !== null ? str(v.label) : ""), id: phpInt(v.id), price: phpRound(phpFloat(v.price), 2), img: truthy(v.img) ? escUrlRaw(str(v.img)) : "" });
      }
      if (vs.length) products.push({ name: sanitizeTextField(str(p.name)), img: truthy(p.img) ? escUrlRaw(str(p.img)) : "", variants: vs });
    }
  }
  if (!products.length) {
    const tv = teeVariants(c);
    if (Object.keys(tv).length) products.push({ name: "Purple Martins T-Shirt", variants: Object.entries(tv).map(([sz, id]) => ({ label: sz, id, price: priceTshirt(c) })) });
  }
  return products;
}
export function variantPrice(c: Ctx, variantId: number): number | null {
  for (const p of storeCatalog(c)) for (const v of p.variants) if (v.id === variantId) return v.price;
  return null;
}
export function variantIsShirt(c: Ctx, variantId: number): boolean {
  for (const p of storeCatalog(c)) for (const v of p.variants) if (v.id === variantId) return /tee|shirt/i.test(p.name);
  return false;
}
export async function memberDiscountPct(c: Ctx, uid: number): Promise<number> {
  const code = await meta(c, uid, "fppm_coupon");
  return truthy(code) && (await typeOf(c, uid)) !== "fan" ? couponPercent(c) : 0;
}

/* ---- HTTP ---- */
async function http(method: string, url: string, headers: Record<string, string>, body?: string, timeout = 30000): Promise<{ code: number; text: string } | PError> {
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    return { code: res.status, text: await res.text() };
  } catch (e) { return new PError(String((e as Error).message ?? e)); }
}
const json = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };

/* ---- PayPal Orders API ---- */
async function ppAccessToken(c: Ctx): Promise<string | PError> {
  const key = "fppm_pp_tok_" + ppEnv(c);
  const cached = await getTransient(c, key);
  if (truthy(cached)) return str(cached);
  const r = await http("POST", ppApiBase(c) + "/v1/oauth2/token", { Authorization: "Basic " + btoa(unescape(encodeURIComponent(ppClientId(c) + ":" + ppSecret(c)))), "Content-Type": "application/x-www-form-urlencoded" }, "grant_type=client_credentials", 20000);
  if (isErr(r)) return r;
  const b = json(r.text);
  if (!isArr(b) || !truthy(b.access_token)) return new PError("PayPal authentication failed (check Client ID/Secret + environment).");
  await setTransient(c, key, b.access_token, Math.max(60, phpInt(b.expires_in !== undefined && b.expires_in !== null ? b.expires_in : 3000) - 120));
  return str(b.access_token);
}
async function ppCreateOrder(c: Ctx, amount: number, desc: string): Promise<string | PError> {
  const tok = await ppAccessToken(c);
  if (isErr(tok)) return tok;
  const r = await http("POST", ppApiBase(c) + "/v2/checkout/orders", { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    phpJson({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: numberFormat(amount, 2).replace(/,/g, "") }, description: desc.slice(0, 120) }] }), 25000);
  if (isErr(r)) return r;
  const b = json(r.text);
  if (!isArr(b) || !truthy(b.id)) return new PError("Could not start PayPal checkout.");
  return str(b.id);
}
async function ppCaptureOrder(c: Ctx, id: string): Promise<Record<string, unknown> | PError> {
  const tok = await ppAccessToken(c);
  if (isErr(tok)) return tok;
  const r = await http("POST", ppApiBase(c) + "/v2/checkout/orders/" + rawurlencode(id) + "/capture", { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, "{}", 25000);
  if (isErr(r)) return r;
  const b = json(r.text);
  if (!isArr(b) || b.status !== "COMPLETED") return new PError("Payment was not completed.");
  return b;
}

/* ---- Printful Orders API ---- */
async function printfulCreateOrder(c: Ctx, uid: number, variantId: number): Promise<any> {
  const tok = printfulToken(c);
  if (!truthy(tok)) return new PError("No Printful API token set.");
  const u = await c.env.DB.prepare("select email from wp_users where id = ?").bind(uid).first<{ email: string }>();
  const body = {
    recipient: {
      name: await displayName(c, uid), address1: await meta(c, uid, "fppm_address"), city: await meta(c, uid, "fppm_city"),
      state_code: str(await meta(c, uid, "fppm_state")).replace(/[a-z]/g, (ch) => ch.toUpperCase()), country_code: "US", zip: await meta(c, uid, "fppm_zip"), email: u ? u.email : "",
    },
    items: [{ sync_variant_id: Math.trunc(variantId), quantity: 1 }],
  };
  const confirm = opt(c, "fppm_printful_confirm", "0") === "1";
  const r = await http("POST", "https://api.printful.com/orders" + (confirm ? "?confirm=1" : ""), { ...printfulHeaders(c), "Content-Type": "application/json" }, phpJson(body));
  if (isErr(r)) return r;
  const b = json(r.text);
  if (r.code < 200 || r.code >= 300) return new PError(isArr(b) && b.error?.message !== undefined && b.error?.message !== null ? str(b.error.message) : "Printful HTTP " + r.code);
  return isArr(b) && b.result !== undefined && b.result !== null ? b.result : b;
}

/* ---- checkout AJAX (signed-in members) ---- */
export async function shopCreate(c: AjaxCtx): Promise<Reply> {
  if (!c.uid) return error("Please sign in.");
  const uid = c.uid;
  const vid = c.post.variant !== undefined ? phpInt(str(c.post.variant)) : 0;
  const base = variantPrice(c, vid);
  if (base === null) return error("That item is unavailable.");
  const amount = phpRound(base * (1 - (await memberDiscountPct(c, uid)) / 100), 2);
  const order = await ppCreateOrder(c, amount, "Purple Martins merch");
  if (isErr(order)) return error(order.message);
  await setTransient(c, "fppm_ord_" + order, { uid, variant: vid, amount }, 3600);
  return success({ id: order });
}
export async function shopCapture(c: AjaxCtx): Promise<Reply> {
  if (!c.uid) return error("Please sign in.");
  const uid = c.uid;
  const oid = c.post.order_id !== undefined ? sanitizeTextField(str(c.post.order_id)) : "";
  const pending = await getTransient(c, "fppm_ord_" + oid);
  if (!isArr(pending) || phpInt(pending.uid) !== uid) return error("Order not found — please retry.");
  const cap = await ppCaptureOrder(c, oid);
  if (isErr(cap)) return error(cap.message);
  await deleteTransient(c, "fppm_ord_" + oid);
  const pf = await printfulCreateOrder(c, uid, phpInt(pending.variant));
  const logRaw = await meta(c, uid, "fppm_orders");
  const log: unknown[] = Array.isArray(logRaw) ? logRaw : isArr(logRaw) ? Object.values(logRaw) : [];
  log.push({ at: currentMysql(c), variant: phpInt(pending.variant), amount: pending.amount, paypal: oid,
    printful: isErr(pf) ? "ERROR: " + pf.message : isArr(pf) && pf.id !== undefined && pf.id !== null ? pf.id : "created" });
  await setMeta(c, uid, "fppm_orders", log);
  if (variantIsShirt(c, phpInt(pending.variant))) await setOpt(c, "fppm_store_shirts_sold", phpInt(opt(c, "fppm_store_shirts_sold", 0)) + 1);
  if (isErr(pf)) await sendMail(c.env, notifyEmail(c), "[FPPM] Printful fulfillment failed", "Member " + (await displayName(c, uid)) + " paid (PayPal " + oid + ") but the Printful order failed: " + pf.message + ". Fulfill it manually.");
  return success({ msg: "Order placed — thanks! Ships to your address on file." });
}

/** fppm_store_html(): the catalog with the member's discount, a PayPal button per product. */
export async function storeHtml(c: Ctx): Promise<string> {
  const pct = await memberDiscountPct(c, c.uid);
  const cat = storeCatalog(c);
  const sdk = "https://www.paypal.com/sdk/js?client-id=" + rawurlencode(ppClientId(c)) + "&currency=USD&intent=capture";
  let o = '<div class="fppm-card"><h3>Team store</h3>';
  if (pct > 0) o += '<p class="fppm-muted">Your <strong>' + esc(numberFormat(pct, 0)) + "% " + esc(collective(c)) + " discount</strong> is applied automatically at checkout.</p>";
  o += '<div class="fppm-apparel">';
  let i = 0;
  for (const p of cat) {
    i++;
    const pimg = truthy(p.img) ? p.img! : "";
    o += '<div class="fppm-appcard">';
    if (pimg) o += '<img id="fppm-img-' + i + '" src="' + escUrl(pimg) + '" alt="' + esc(p.name) + '" loading="lazy" style="display:block;height:130px;width:auto;max-width:100%;object-fit:contain;margin:0 auto .5em;border-radius:6px;">';
    o += "<b>" + esc(p.name) + "</b>";
    o += '<select id="fppm-v-' + i + '" style="width:100%;padding:.5em;border:1px solid var(--fppm-line);border-radius:6px;margin:.5em 0;">';
    for (const v of p.variants) {
      const disc = phpRound(v.price * (1 - pct / 100), 2);
      const lab = (v.label !== "" ? v.label : "Option") + " — $" + numberFormat(disc, 2);
      const vimg = truthy(v.img) ? v.img! : "";
      o += '<option value="' + esc(v.id) + '" data-img="' + escUrl(vimg) + '">' + esc(lab) + "</option>";
    }
    o += '</select><div id="fppm-pp-' + i + '"></div></div>';
  }
  o += '</div><div id="fppm-pp-msg" class="fppm-muted" style="font-size:.85rem;margin-top:.5em;"></div>';
  o += '<p class="fppm-muted" style="margin-top:.4em;">Ships on-demand via Printful to your address on file.</p></div>';
  o += '<script>var fppmAjax="' + escJs(adminUrl(c, "admin-ajax.php")) + '",fppmShopNonce="' + escJs(nonce("fppm_shop")) + '",fppmN=' + i + ";</script>";
  o += '<script src="' + escUrl(sdk) + '"></script>';
  return o + FPPM_STORE_HTML[0];
}

/** esc_js(): WordPress's rules. */
export function escJs(text: string): string {
  let s = text.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  s = s.replace(/\\(.?)/g, (_m, ch: string) => (ch === "\\" ? "\\" : ch === "0" ? "\0" : ch)); // stripslashes()
  s = s.replace(/&#(?:x0*27|0*39);?/gi, "'");
  s = s.replace(/\r/g, "");
  return s.replace(/[\\'"\0]/g, (ch) => (ch === "\0" ? "\\0" : "\\" + ch)).replace(/\n/g, "\\n");
}

/** fppm_merch_teaser_html(): a tee mockup and its lowest price, for the join page (empty without mockups). */
export function merchTeaserHtml(c: Ctx): string {
  const cat = storeCatalog(c);
  if (!cat.length) return "";
  let pick: Product | null = null;
  for (const p of cat) {
    if (!truthy(p.img)) continue;
    if (pick === null) pick = p;
    if (/tee|shirt/i.test(p.name)) { pick = p; break; }
  }
  if (!pick) return "";
  let price: number | null = null;
  for (const v of pick.variants) if (price === null || v.price < price) price = v.price;
  let o = '<div class="fppm-card" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">';
  o += '<img src="' + escUrl(pick.img) + '" alt="' + esc(pick.name) + '" loading="lazy" style="width:88px;height:88px;object-fit:contain;flex:0 0 auto;">';
  o += '<div style="flex:1 1 200px;min-width:0;">';
  o += "<b style=\"font-family:'Oswald',sans-serif;font-size:1.1rem;text-transform:uppercase;\">" + esc(pick.name) + "</b>";
  if (price !== null) o += "<div style=\"font-family:'Oswald',sans-serif;font-size:1.25rem;font-weight:700;margin:.1em 0 .3em;\">$" + esc(numberFormat(price, 2)) + "</div>";
  o += '<div class="fppm-muted">Supporters get the official tee + a ' + esc(numberFormat(couponPercent(c), 0)) + "% off merch code. Join below to shop the full store.</div>";
  return o + "</div></div>";
}

/* ---- Settings → "Fetch catalog from Printful" (admin-post fppm_fetch_catalog) ---- */
const bounce = (back: string, msg: string) => new RedirectReply(addQueryArg({ fppm_catalog: "err", fppm_catalog_msg: rawurlencode(msg) }, back));
export async function fetchCatalog(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!can(c, "manage_options")) return new DieReply("Not allowed.");
  const back = adminUrl(c, "admin.php?page=fppm-settings");
  const tok = printfulToken(c);
  if (!truthy(tok)) return bounce(back, "No Printful API token saved — paste it in the In-plugin store section, Save Changes, then click Fetch again.");
  if (!truthy(printfulStoreId(c))) {
    const r = await http("GET", "https://api.printful.com/stores", { Authorization: "Bearer " + tok });
    if (isErr(r)) return bounce(back, r.message);
    const b = json(r.text);
    const stores: any[] = isArr(b) && isArr(b.result) ? Object.values(b.result) : [];
    if (stores.length === 1 && truthy(stores[0]?.id)) await setOpt(c, "fppm_printful_store_id", String(phpInt(stores[0].id)));
    else if (stores.length > 1) {
      const names = stores.map((s) => (s?.name !== undefined && s?.name !== null ? str(s.name) : "?") + " (ID " + (s?.id !== undefined && s?.id !== null ? str(s.id) : "?") + ")");
      return bounce(back, "This token can see several stores: " + names.join(", ") + ". Paste the Martins store's ID into the \"Printful store ID\" field, Save Changes, then click Fetch again.");
    } else return bounce(back, "Printful did not list any store for this token — check the token, or paste the store ID (Printful → Stores → the number in the store URL) into the \"Printful store ID\" field.");
  }
  const headers = printfulHeaders(c);
  let list: any[] = [];
  let offset = 0;
  let batch: any[];
  do {
    const r = await http("GET", "https://api.printful.com/store/products?limit=100&offset=" + offset, headers);
    if (isErr(r)) return bounce(back, r.message);
    const b = json(r.text);
    if (r.code < 200 || r.code >= 300) return bounce(back, isArr(b) && b.error?.message !== undefined && b.error?.message !== null ? str(b.error.message) : "Printful HTTP " + r.code + " — the token may be wrong or for a different store.");
    batch = isArr(b) && isArr(b.result) ? Object.values(b.result) : [];
    list = list.concat(batch);
    offset += 100;
  } while (batch.length === 100);
  if (!list.length) return bounce(back, "The token works, but the Printful store has no products yet — add merch in Printful first.");
  const catalog: { name: string; img: string; variants: { label: string; id: number; price: number; img: string }[] }[] = [];
  let nv = 0, nimg = 0;
  for (const p of list) {
    if (!isArr(p) || !truthy(p.id)) continue;
    const r = await http("GET", "https://api.printful.com/store/products/" + phpInt(p.id), headers);
    if (isErr(r)) return bounce(back, r.message);
    const b = json(r.text);
    const res = isArr(b) ? b.result : undefined;
    if (!isArr(res) || !truthy(res.sync_variants) || !isArr(res.sync_variants)) continue;
    const pname = res.sync_product?.name !== undefined && res.sync_product?.name !== null ? str(res.sync_product.name) : p.name !== undefined && p.name !== null ? str(p.name) : "Product";
    let pimg = res.sync_product?.thumbnail_url !== undefined && res.sync_product?.thumbnail_url !== null ? str(res.sync_product.thumbnail_url) : p.thumbnail_url !== undefined && p.thumbnail_url !== null ? str(p.thumbnail_url) : "";
    const vs = [];
    for (const v of Object.values(res.sync_variants) as any[]) {
      if (!isArr(v) || !truthy(v.id) || v.retail_price === undefined || v.retail_price === null) continue;
      let label = v.name !== undefined && v.name !== null ? str(v.name) : "";
      if (truthy(pname) && label.toLowerCase().startsWith(pname.toLowerCase())) label = label.slice(pname.length).replace(/^[ \-/,\t]+|[ \-/,\t]+$/g, "");
      if (label === "") label = "One size";
      let vimg = "";
      if (truthy(v.files) && isArr(v.files)) for (const f of Object.values(v.files) as any[]) if (f?.type === "preview" && truthy(f?.preview_url)) { vimg = str(f.preview_url); break; }
      if (vimg === "" && truthy(v.product?.image)) vimg = str(v.product.image);
      if (vimg === "") vimg = pimg;
      if (pimg === "" && vimg !== "") pimg = vimg;
      vs.push({ label, id: phpInt(v.id), price: phpRound(phpFloat(v.retail_price), 2), img: vimg });
      nv++;
      if (vimg !== "") nimg++;
    }
    if (vs.length) catalog.push({ name: pname, img: pimg, variants: vs });
  }
  if (!catalog.length) return bounce(back, "No sellable variants found — make sure the products are synced in Printful with retail prices set.");
  await setOpt(c, "fppm_store_catalog", prettyJson(catalog));
  return new RedirectReply(addQueryArg({ fppm_catalog: "ok", p: catalog.length, v: nv, img: nimg }, back));
}

/** wp_json_encode( $v, JSON_PRETTY_PRINT ): PHP's layout (4 spaces), "/" and non-ASCII escaped (whole floats print as integers). */
export function prettyJson(v: unknown, ind = ""): string {
  const next = ind + "    ";
  if (Array.isArray(v)) return v.length ? "[\n" + v.map((x) => next + prettyJson(x, next)).join(",\n") + "\n" + ind + "]" : "[]";
  if (v !== null && typeof v === "object") {
    const e = Object.entries(v);
    return e.length ? "{\n" + e.map(([k, x]) => next + phpJson(k) + ": " + prettyJson(x, next)).join(",\n") + "\n" + ind + "}" : "{}";
  }
  if (typeof v === "number") return String(v);
  return phpJson(v);
}
