import { getSessionUser } from "@mgc/sso";
import products from "../../src/data/products.json";
import type { Env } from "../env";

/**
 * POST /api/checkout  (form fields: slug, quantity)
 * Creates a Stripe Checkout Session for one catalog item and redirects to it.
 * Prices always come from the catalog file, never from the browser.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  const product = products.find((p) => p.slug === form.get("slug") && p.active);
  if (!product) return new Response("That item is not available.", { status: 404 });
  const quantity = Math.min(Math.max(parseInt(String(form.get("quantity") ?? "1"), 10) || 1, 1), 20);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/product/${product.slug}/`,
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
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const session = (await res.json()) as { url?: string; error?: { message: string } };
  if (!res.ok || !session.url) {
    console.error("Stripe checkout failed", session.error?.message);
    return new Response("Checkout is unavailable right now. Please try again shortly.", { status: 502 });
  }
  return Response.redirect(session.url, 303);
};
