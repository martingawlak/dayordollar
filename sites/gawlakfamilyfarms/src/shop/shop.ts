/**
 * The shop's server side, the same on every site: "Buy now" → a Stripe
 * Checkout Session (price from the catalogue, the shared Customer when signed
 * in); Stripe's webhook → the order recorded once, the buyer's receipt and the
 * admin's notice, and the site's fulfilment (Printful on dayordollar.com);
 * "Your orders" across every site from Stripe.
 */
import { type CheckoutItem, completedSessions, createSession, customerForAccount, findCustomer, sessionParams, StripeError, type StripeEnv, verifyWebhook } from "./stripe";
import { findProduct, findVariation, money, type Product, variationLabel } from "./catalog";

/** What the shop needs from a site's request context. */
export interface ShopCtx {
  env: StripeEnv & { DB: D1Database; STRIPE_WEBHOOK_SECRET?: string };
  uid: number;
  user: { user_email: string; display_name: string } | null;
  origin: string;
  now: number;
}
export interface Fulfilment { status: string; printful_order?: string; note?: string }
export interface ShopSite {
  /** The site's name in Stripe metadata, e.g. "dayordollar.com". */
  site: string;
  products: Product[];
  /** wp_mail(): the site's own mail. */
  sendMail: (to: string, subject: string, body: string) => Promise<unknown>;
  adminEmail: string;
  /** After an order is recorded: hand it on (Printful), or leave it for a person. */
  fulfil?: (order: OrderRow, session: any) => Promise<Fulfilment>;
}
export type OrderRow = Record<string, any>;

const gmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ");

/** The signed-in person's shared account id (wp_users.account_id), or "". */
async function accountId(c: ShopCtx): Promise<string> {
  if (!c.uid) return "";
  const r = await c.env.DB.prepare("select account_id from wp_users where id = ?").bind(c.uid).first<{ account_id: string | null }>();
  return r?.account_id ?? "";
}

/** POST /shop/checkout (product, variation, quantity): Stripe Checkout, or a plain error page. */
export async function checkout(c: ShopCtx, s: ShopSite, form: Record<string, string>): Promise<Response> {
  const p = findProduct(s.products, form.product ?? "");
  if (!p) return new Response("That item is not available.", { status: 404 });
  const v = p.variations.length ? findVariation(p, form.variation) : null;
  if (p.variations.length && !v) return new Response("Please choose the options first.", { status: 400 });
  const quantity = Math.min(Math.max(parseInt(form.quantity ?? "1", 10) || 1, 1), 20);
  const item: CheckoutItem = {
    site: s.site, sku: v?.sku || String(p.id), product: p.id, variation: v?.id, quantity, currency: p.currency, shipping: p.shipping,
    name: v ? `${p.name} — ${variationLabel(p, v)}` : p.name, unitAmount: v ? v.price : p.price, image: v?.image ?? p.image,
  };
  const acct = await accountId(c);
  let customer: string | undefined;
  try {
    if (acct && c.user) customer = await customerForAccount(c.env, acct, c.user.user_email, c.user.display_name);
    const session = await createSession(c.env, sessionParams(item, { customer, email: c.user?.user_email, accountId: acct || undefined }, {
      success: `${c.origin}/shop/thanks/?session_id={CHECKOUT_SESSION_ID}`,
      cancel: `${c.origin}/product/${p.slug}/`,
    }));
    return Response.redirect(session.url, 303);
  } catch (e) {
    console.error("checkout failed", e instanceof StripeError ? e.message : e);
    return new Response("Checkout is unavailable right now. Please try again shortly.", { status: 502 });
  }
}

/** The shipping name and address of a completed session (where Stripe's API version keeps it). */
const shippingOf = (session: any) => session?.collected_information?.shipping_details ?? session?.shipping_details ?? null;

/** Record a completed session once. Returns the row, and whether this call created it. */
export async function recordOrder(c: ShopCtx, s: ShopSite, session: any, eventId: string): Promise<{ order: OrderRow; created: boolean }> {
  const md = session.metadata ?? {};
  const p = s.products.find((x) => String(x.id) === String(md.product)) ?? null;
  const v = p && md.variation ? findVariation(p, md.variation) : null;
  const item = p ? (v ? `${p.name} — ${variationLabel(p, v)}` : p.name) : String(md.sku ?? "");
  const r = await c.env.DB.prepare(
    "insert into shop_orders (stripe_session, stripe_event, site, account_id, customer, email, name, product_id, variation_id, sku, item, quantity, amount_total, currency, shipping, status, created) "
    + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?) on conflict (stripe_session) do nothing",
  ).bind(
    session.id, eventId, s.site, md.mgc_account || null, session.customer || null, session.customer_details?.email ?? session.customer_email ?? null,
    session.customer_details?.name ?? shippingOf(session)?.name ?? null, p?.id ?? null, v?.id ?? null, md.sku ?? null, item,
    Number(md.quantity ?? session.line_items?.data?.[0]?.quantity ?? 1) || 1, Number(session.amount_total ?? 0), String(session.currency ?? "usd"),
    shippingOf(session) ? JSON.stringify(shippingOf(session)) : null, gmt(c.now),
  ).run();
  const order = (await c.env.DB.prepare("select * from shop_orders where stripe_session = ?").bind(session.id).first<OrderRow>())!;
  return { order, created: (r.meta?.changes ?? 0) > 0 };
}

/** The buyer's receipt: plain text, honest about what happens next. */
function receipt(s: ShopSite, o: OrderRow): string {
  const ship = o.shipping ? JSON.parse(o.shipping) : null;
  const a = ship?.address;
  return `Thank you for your order from ${s.site}.\n\n`
    + `Order #${o.id}\n${o.item}${o.quantity > 1 ? ` × ${o.quantity}` : ""}\nPaid: ${money(o.amount_total)} (${String(o.currency).toUpperCase()})\n`
    + (a ? `\nShipping to:\n${ship.name ?? ""}\n${a.line1 ?? ""}${a.line2 ? "\n" + a.line2 : ""}\n${a.city ?? ""}, ${a.state ?? ""} ${a.postal_code ?? ""}\n` : "")
    + `\nWe'll email you when it ships. Stripe sends its own payment receipt separately.\n`
    + `Questions? Reply to this email.\n`;
}
function adminNotice(s: ShopSite, o: OrderRow, f: Fulfilment): string {
  return `New order on ${s.site}: #${o.id}\n\n${o.item} × ${o.quantity}\n${money(o.amount_total)} (${String(o.currency).toUpperCase()})\n`
    + `Buyer: ${o.name ?? ""} <${o.email ?? ""}>\nStripe session: ${o.stripe_session}\n\n`
    + `Fulfilment: ${f.status}${f.printful_order ? ` (Printful order ${f.printful_order})` : ""}\n${f.note ? f.note + "\n" : ""}`;
}

/** POST /shop/stripe-webhook: checkout.session.completed for this site → the order, the emails, the fulfilment. */
export async function webhook(c: ShopCtx, s: ShopSite, payload: string, signature: string | null): Promise<Response> {
  if (!(await verifyWebhook(c.env.STRIPE_WEBHOOK_SECRET ?? "", payload, signature, c.now))) return new Response("bad signature", { status: 400 });
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("bad payload", { status: 400 }); }
  if (event.type !== "checkout.session.completed") return Response.json({ ignored: event.type });
  const session = event.data?.object ?? {};
  // One Stripe account sells for every site: each site's endpoint takes only its own sessions.
  if (session.metadata?.site !== s.site) return Response.json({ ignored: "another site" });
  if (session.payment_status !== "paid") return Response.json({ ignored: "not paid" });
  const { order, created } = await recordOrder(c, s, session, String(event.id ?? ""));
  if (!created) return Response.json({ duplicate: order.id });
  const f: Fulfilment = s.fulfil ? await s.fulfil(order, session) : { status: "needs_fulfilment", note: "Fulfil this order by hand." };
  await c.env.DB.prepare("update shop_orders set status = ?, printful_order = ?, note = ? where id = ?").bind(f.status, f.printful_order ?? null, f.note ?? null, order.id).run();
  const o: OrderRow = { ...order, ...f };
  if (o.email) await s.sendMail(o.email, `Your order #${o.id} — ${s.site}`, receipt(s, o));
  await s.sendMail(s.adminEmail, `[${s.site}] New order #${o.id}: ${o.item}${f.status === "needs_manual_printful" ? " — needs manual Printful" : ""}`, adminNotice(s, o, f));
  return Response.json({ recorded: o.id, status: f.status });
}

export interface OrderLine { site: string; date: string; item: string; amount: number; currency: string; ref: string }
/**
 * "Your orders": every site's orders for the signed-in person. From Stripe (the
 * one place that sees all sites, martingawlakcompany.com included) by their
 * shared Customer; this site's own records when Stripe can't be asked.
 */
export async function yourOrders(c: ShopCtx, s: ShopSite): Promise<{ from: "stripe" | "site"; lines: OrderLine[] }> {
  const acct = await accountId(c);
  if (!acct || !c.user) return { from: "site", lines: [] };
  try {
    // Search only: looking at orders never creates a Customer.
    const customer = await findCustomer(c.env, acct);
    const sessions = customer ? await completedSessions(c.env, customer) : [];
    return {
      from: "stripe",
      lines: sessions.map((x) => ({
        site: String(x.metadata?.site ?? ""), date: gmt(Number(x.created ?? 0)).slice(0, 10),
        item: String(x.line_items?.data?.map((l: any) => l.description).join(", ") ?? ""), amount: Number(x.amount_total ?? 0), currency: String(x.currency ?? "usd"), ref: String(x.id),
      })),
    };
  } catch (e) {
    console.error("orders from Stripe failed", e instanceof StripeError ? e.message : e);
    const rows = await c.env.DB.prepare("select * from shop_orders where account_id = ? order by id desc limit 50").bind(acct).all<OrderRow>();
    return { from: "site", lines: rows.results.map((o) => ({ site: o.site, date: String(o.created).slice(0, 10), item: o.item, amount: o.amount_total, currency: o.currency, ref: String(o.id) })) };
  }
}
