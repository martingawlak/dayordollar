import type { Env } from "../../env.ts";
import { cancelOrder, fulfillOrder, orderView } from "../../lib/db.ts";
import { sendTicketsEmail } from "../../lib/email.ts";
import { verifyWebhook } from "../../lib/stripe.ts";

/**
 * POST /api/stripe/webhook  (events: checkout.session.completed,
 * checkout.session.async_payment_succeeded, checkout.session.expired)
 * Issues tickets even when the buyer closes the tab before the success page.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyWebhook(env.STRIPE_WEBHOOK_SECRET, payload, request.headers.get("stripe-signature"))))
    return new Response("Bad signature", { status: 400 });

  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; client_reference_id?: string; payment_status?: string; customer_details?: { email?: string } } } };
  const s = event.data.object;
  const orderId = s.client_reference_id;
  if (!orderId) return new Response("ok");

  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && s.payment_status === "paid") {
    if (await fulfillOrder(env.DB, orderId, { sessionId: s.id })) {
      const view = await orderView(env.DB, orderId);
      const email = await env.DB.prepare("SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?").bind(orderId).first<string>("email");
      if (view && email) await sendTicketsEmail(env, new URL(request.url).origin, view, email);
    }
  } else if (event.type === "checkout.session.expired") {
    await cancelOrder(env.DB, orderId, true);
  }
  return new Response("ok");
};
