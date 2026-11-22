import type { Env } from "../../../env.ts";
import { fulfillOrder, orderView, type OrderRow } from "../../../lib/db.ts";
import { sendTicketsEmail } from "../../../lib/email.ts";
import { capturePayment } from "../../../lib/paypal.ts";
import { fail, json } from "../../../lib/util.ts";

/**
 * POST /api/orders/:id/capture  { paypalOrderId }
 * The buyer approved in PayPal's window: charge it, and if PayPal confirms the
 * full amount for this order, issue and email the tickets.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id);
  const { paypalOrderId } = (await request.json().catch(() => ({}))) as { paypalOrderId?: string };
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!order || order.method !== "card") return fail("Order not found", 404);
  // Only the PayPal order this order created can pay for it.
  if (!paypalOrderId || paypalOrderId !== order.paypal_order_id) return fail("That payment doesn't match this order.");
  if (order.status === "paid") return json({ order: await orderView(env.DB, id) });
  if (order.status === "refunded") return fail("This order was refunded.", 409);

  let paid = false;
  try {
    paid = await capturePayment(env, order, paypalOrderId);
  } catch (err) {
    console.error(err);
  }
  if (!paid) return fail("PayPal didn't complete the payment, so you weren't charged. Try again or pick another way to pay.", 402);

  if (await fulfillOrder(env.DB, id, { sessionId: undefined })) {
    const view = await orderView(env.DB, id);
    const email = await env.DB.prepare("SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?").bind(id).first<string>("email");
    if (view && email) await sendTicketsEmail(env, new URL(request.url).origin, view, email);
  }
  return json({ order: await orderView(env.DB, id) });
};
