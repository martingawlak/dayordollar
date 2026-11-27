/**
 * Stripe for Martin Gawlak Company's sites: one Stripe account, one Customer
 * per shared account (the accounts service's id, kept on the Customer as
 * metadata mgc_account), Checkout Sessions for the shops, and the webhook's
 * signature check. No SDK: Stripe's REST API with form encoding.
 *
 * The same file lives in each site's Worker (as sso.ts does); keep the copies
 * identical. Restricted-key permissions it needs: Customers (read and write),
 * Checkout Sessions (read and write).
 */

export interface StripeEnv { STRIPE_SECRET_KEY?: string }

export const STRIPE_API = "https://api.stripe.com";

/** Stripe's form encoding: nested objects as a[b][c], arrays as a[0]. */
export function formEncode(obj: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(prefix ? `${prefix}[${k}]` : k, x);
    else out.push(encodeURIComponent(prefix) + "=" + encodeURIComponent(String(v)));
  };
  walk("", obj);
  return out.join("&");
}

export class StripeError extends Error { constructor(public status: number, message: string) { super(message); } }

/** One Stripe API call; throws StripeError on a non-2xx answer. */
export async function stripe<T = any>(env: StripeEnv, method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeError(0, "STRIPE_SECRET_KEY is not set");
  const body = formEncode(params);
  const headers: Record<string, string> = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (method === "POST") headers["content-type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(STRIPE_API + path + (method === "GET" && body ? "?" + body : ""), { method, headers, body: method === "POST" ? body : undefined });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, j?.error?.message ?? `Stripe answered ${res.status}`);
  return j as T;
}

/**
 * The Stripe Customer for a shared account: found by metadata
 * mgc_account=<account id> (Customer search), else created. The create
 * carries an idempotency key derived from the account id, so two sites
 * creating the same person within Stripe's 24 hours (before search has
 * indexed the first) still get one Customer.
 */
export async function customerForAccount(env: StripeEnv, accountId: string, email: string, name = ""): Promise<string> {
  const safe = accountId.replace(/['\\]/g, "");
  const found = await findCustomer(env, accountId);
  if (found) return found;
  const created = await stripe<{ id: string }>(env, "POST", "/v1/customers", { email, name: name || undefined, metadata: { mgc_account: accountId } }, `mgc-account-${safe}`);
  return created.id;
}

/** The shared account's Stripe Customer, if there is one yet (search only). */
export async function findCustomer(env: StripeEnv, accountId: string): Promise<string | null> {
  const safe = accountId.replace(/['\\]/g, "");
  const found = await stripe<{ data: { id: string }[] }>(env, "GET", "/v1/customers/search", { query: `metadata['mgc_account']:'${safe}'`, limit: 1 });
  return found.data?.[0]?.id ?? null;
}

export interface CheckoutItem {
  site: string;
  sku: string;
  /** The catalogue's product and (if any) variation ids. */
  product: number | string;
  variation?: number | string;
  name: string;
  /** Unit price in cents, from the server-side catalogue only. */
  unitAmount: number;
  currency: string;
  quantity: number;
  image?: string | null;
  /** Physical goods: collect a US shipping address. */
  shipping: boolean;
}

/** The Checkout Session's parameters: the shared Customer when signed in (saved cards offered and kept), else the email for a guest. */
export function sessionParams(item: CheckoutItem, buyer: { customer?: string; email?: string; accountId?: string }, urls: { success: string; cancel: string }): Record<string, unknown> {
  const metadata: Record<string, string> = { site: item.site, sku: item.sku, product: String(item.product), variation: item.variation !== undefined ? String(item.variation) : "", quantity: String(item.quantity) };
  if (buyer.accountId) metadata.mgc_account = buyer.accountId;
  const p: Record<string, unknown> = {
    mode: "payment",
    success_url: urls.success,
    cancel_url: urls.cancel,
    line_items: [{
      quantity: item.quantity,
      price_data: { currency: item.currency, unit_amount: item.unitAmount, product_data: { name: item.name, images: item.image ? [item.image] : undefined, metadata: { sku: item.sku } } },
    }],
    metadata,
    payment_intent_data: { metadata },
    client_reference_id: buyer.accountId,
  };
  if (item.shipping) p.shipping_address_collection = { allowed_countries: ["US"] };
  if (buyer.customer) {
    p.customer = buyer.customer;
    // Offer to keep the card for next time (on any of the sites); saved ones are shown.
    p.saved_payment_method_options = { payment_method_save: "enabled", allow_redisplay_filters: ["always"] };
    if (item.shipping) p.customer_update = { shipping: "auto" };
  } else if (buyer.email) {
    p.customer_email = buyer.email;
  }
  return p;
}

export const createSession = (env: StripeEnv, params: Record<string, unknown>) =>
  stripe<{ id: string; url: string }>(env, "POST", "/v1/checkout/sessions", params);

/** A customer's completed Checkout Sessions on every site, newest first, with their line items. */
export async function completedSessions(env: StripeEnv, customer: string, limit = 25): Promise<any[]> {
  const j = await stripe<{ data: any[] }>(env, "GET", "/v1/checkout/sessions", { customer, status: "complete", limit, expand: ["data.line_items"] });
  return j.data ?? [];
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
/** Stripe-Signature check: HMAC-SHA256 of "<t>.<payload>" with the endpoint's secret, within the tolerance (seconds). */
export async function verifyWebhook(secret: string, payload: string, header: string | null, now = Math.floor(Date.now() / 1000), tolerance = 300): Promise<boolean> {
  if (!secret || !header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v; else if (k === "v1") sigs.push(v);
  }
  if (!/^\d+$/.test(t) || !sigs.length || Math.abs(now - Number(t)) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => {
    if (s.length !== want.length) return false;
    let r = 0;
    for (let i = 0; i < s.length; i++) r |= s.charCodeAt(i) ^ want.charCodeAt(i);
    return r === 0;
  });
}
