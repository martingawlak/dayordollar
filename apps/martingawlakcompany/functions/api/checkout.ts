import { getSessionUser } from "@mgc/sso";
import products from "../../src/data/products.json";
import type { Env } from "../env";
import { customerForAccount } from "../../src/lib/stripe";

/**
 * POST /api/checkout  (form fields: slug, quantity)
 * GET  /api/checkout?slug=...  (plain links to a product)
 * Creates a Stripe Checkout Session for one catalog item and redirects to it.
 * Prices always come from the catalog file, never from the browser.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  return checkout(request, env, form.get("slug"), form.get("quantity"));
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams;
  return checkout(request, env, params.get("slug"), params.get("quantity"));
};

async function checkout(request: Request, env: Env, slug: unknown, qty: unknown): Promise<Response> {
  const product = products.find((p) => p.slug === slug && p.active);
  if (!product) return new Response("That item is not available.", { status: 404 });
  const quantity = Math.min(Math.max(parseInt(String(qty ?? "1"), 10) || 1, 1), 20);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: sameOriginReferer(request, origin) ?? `${origin}/product/${product.slug}/`,
    "line_items[0][quantity]": String(quantity),
    "line_items[0][price_data][currency]": product.currency,
    "line_items[0][price_data][unit_amount]": String(product.priceCents),
    "line_items[0][price_data][product_data][name]": product.name,
    "line_items[0][price_data][product_data][metadata][sku]": product.sku,
    "metadata[sku]": product.sku,
    "metadata[site]": "martingawlakcompany.com",
  });
  if (product.summary) params.set("line_items[0][price_data][product_data][description]", product.summary);
  if (product.image) params.set("line_items[0][price_data][product_data][images][0]", `${origin}${product.image}`);
  if (product.shipping) params.set("shipping_address_collection[allowed_countries][0]", "US");

  const user = await getSessionUser(request, env);
  if (user?.email) {
    params.set("customer_email", user.email);
    params.set("client_reference_id", user.id);
    if (env.STRIPE_SHARED_CUSTOMER === "1") await useSharedCustomer(env, params, user, !!product.shipping);
  }

  const unavailable = () =>
    new Response("Checkout is unavailable right now. Please try again shortly.", { status: 502 });
  let session: { url?: string; error?: { message: string } };
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    session = await res.json();
    if (!res.ok) session.url = undefined;
  } catch (err) {
    console.error("Stripe request failed", err);
    return unavailable();
  }
  if (!session.url) {
    console.error("Stripe checkout failed", session.error?.message);
    return unavailable();
  }
  return Response.redirect(session.url, 303);
}

/**
 * With STRIPE_SHARED_CUSTOMER=1: the signed-in person's one Stripe Customer,
 * shared with dayordollar.com and gawlakfamilyfarms.com (found by
 * metadata.mgc_account = their account id, created if none), saving the card
 * offered and saved cards shown, so their orders on every site list together.
 * Needs the key to have Customers: Write as well. If the Customer can't be
 * had (e.g. the key can't), checkout carries on exactly as without the flag.
 */
async function useSharedCustomer(env: Env, params: URLSearchParams, user: { id: string; email: string; name?: string }, shipping: boolean): Promise<void> {
  let customer: string;
  try {
    customer = await customerForAccount(env, user.id, user.email, user.name ?? "");
  } catch (err) {
    console.error("Shared Stripe customer unavailable; checking out by email", err instanceof Error ? err.message : err);
    return;
  }
  params.delete("customer_email");
  params.set("customer", customer);
  params.set("saved_payment_method_options[payment_method_save]", "enabled");
  params.set("saved_payment_method_options[allow_redisplay_filters][0]", "always");
  if (shipping) params.set("customer_update[shipping]", "auto");
  params.set("metadata[mgc_account]", user.id);
  params.set("payment_intent_data[metadata][site]", "martingawlakcompany.com");
  params.set("payment_intent_data[metadata][mgc_account]", user.id);
}

/** Send cancelled checkouts back to the page they came from, if it's on this site. */
function sameOriginReferer(request: Request, origin: string): string | undefined {
  const referer = request.headers.get("referer");
  try {
    return referer && new URL(referer).origin === origin ? referer : undefined;
  } catch {
    return undefined;
  }
}
