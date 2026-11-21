import { getSessionUser } from "@mgc/sso";
import { enabledMethods, TIP_OPTIONS_CENTS, type PayMethod } from "../../../src/config.ts";
import type { Env } from "../../env.ts";
import { cancelOrder, eventBySlug, fulfillOrder, HOLD_MS, publicEvent, reserveOrder, upsertCustomer } from "../../lib/db.ts";
import { createCheckout } from "../../lib/stripe.ts";
import { fail, isEmail, json } from "../../lib/util.ts";

/**
 * POST /api/orders  { event, quantity, tipCents, method, name, email, phone, optIn }
 * Customer intake + ticket reservation. Card orders get a Stripe Checkout URL;
 * Cash App / Venmo / PayPal / Zelle orders are held until staff confirm payment.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request");
  }
  const str = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max);
  const name = str("name", 200);
  const email = str("email", 320).toLowerCase();
  const phone = str("phone", 40);
  const method = str("method", 20) as PayMethod;
  const quantity = Number(body.quantity);
  const tipCents = Number(body.tipCents ?? 0);

  if (!name) return fail("Please add your name.");
  if (!isEmail(email)) return fail("Please add a valid email so we can send your tickets.");
  if (!TIP_OPTIONS_CENTS.includes(tipCents)) return fail("Invalid tip.");

  const event = await eventBySlug(env.DB, str("event", 200));
  if (!event || event.status === "draft") return fail("Show not found.", 404);
  const pub = publicEvent(event);
  if (!pub.onSale) return fail(pub.cancelled ? "This show was cancelled." : "Tickets aren't available for this show.", 409);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > event.max_per_order)
    return fail(`Choose 1 to ${event.max_per_order} tickets.`);

  const free = event.price_cents === 0 && tipCents === 0;
  if (!free && !enabledMethods().includes(method)) return fail("Choose a way to pay.");

  const user = await getSessionUser(request, env);
  const customerId = await upsertCustomer(env.DB, {
    email,
    name,
    phone,
    optIn: body.optIn === true,
    ssoUserId: user?.email?.toLowerCase() === email ? user.id : null,
  });

  const order = await reserveOrder(env.DB, {
    eventId: event.id,
    customerId,
    quantity,
    tipCents,
    method: free ? "free" : method,
    holdMs: method === "card" ? HOLD_MS.card : HOLD_MS.manual,
  });
  if (!order) return fail(`Only ${pub.available} ticket${pub.available === 1 ? "" : "s"} left.`, 409);

  if (free) {
    await fulfillOrder(env.DB, order.id);
    return json({ orderId: order.id });
  }
  if (method !== "card") return json({ orderId: order.id });

  try {
    const session = await createCheckout(env, new URL(request.url).origin, order, event, email);
    await env.DB.prepare("UPDATE orders SET stripe_session_id = ? WHERE id = ?").bind(session.id, order.id).run();
    return json({ orderId: order.id, redirect: session.url });
  } catch (err) {
    console.error(err);
    await cancelOrder(env.DB, order.id, true);
    return fail("Card checkout is unavailable right now. Try another way to pay, or again shortly.", 502);
  }
};
