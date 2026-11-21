import type { Env } from "../../env.ts";
import { cancelOrder, fulfillOrder, orderView } from "../../lib/db.ts";
import { sendTicketsEmail } from "../../lib/email.ts";
import { getCheckout } from "../../lib/stripe.ts";
import { fail, json } from "../../lib/util.ts";

/**
 * GET /api/orders/:id[?session_id=]  the buyer's order and tickets. The long
 * random id is the secret. Coming back from Stripe, the session is checked
 * right away so tickets show without waiting for the webhook.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id);
  let view = await orderView(env.DB, id);
  if (!view) return fail("Order not found", 404);

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (sessionId && view.method === "card" && view.status !== "paid" && view.status !== "refunded") {
    try {
      const s = await getCheckout(env, sessionId);
      if (s.client_reference_id === id && s.payment_status === "paid") {
        if (await fulfillOrder(env.DB, id, { sessionId })) {
          view = (await orderView(env.DB, id))!;
          const email = await env.DB.prepare("SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?").bind(id).first<string>("email");
          if (email) await sendTicketsEmail(env, new URL(request.url).origin, view, email);
        }
      }
    } catch (err) {
      console.error("Could not confirm Stripe session", err);
    }
    view = (await orderView(env.DB, id))!;
  }
  return json({ order: view });
};

/** DELETE /api/orders/:id  release an unpaid card order's hold (buyer backed out of Stripe). */
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id);
  const order = await env.DB.prepare("SELECT method, status FROM orders WHERE id = ?").bind(id).first<{ method: string; status: string }>();
  if (!order) return fail("Order not found", 404);
  if (order.method === "card" && order.status === "pending") await cancelOrder(env.DB, id, true);
  return json({ ok: true });
};
