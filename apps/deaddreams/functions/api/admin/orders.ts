import type { Env } from "../../env.ts";
import { cancelOrder, fulfillOrder, orderView, reserveOrder, upsertCustomer } from "../../lib/db.ts";
import { sendTicketsEmail } from "../../lib/email.ts";
import type { Role } from "../../lib/staff.ts";
import type { SessionUser } from "@mgc/sso";
import { fail, isEmail, json } from "../../lib/util.ts";

/** GET /api/admin/orders?event=&status=&q=  newest first. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const p = new URL(request.url).searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  if (p.get("event")) (where.push("o.event_id = ?"), args.push(p.get("event")));
  if (p.get("status")) (where.push("o.status = ?"), args.push(p.get("status")));
  if (p.get("q")) {
    const q = `%${p.get("q")!.toLowerCase()}%`;
    where.push("(lower(c.name) LIKE ? OR c.email LIKE ? OR lower(o.code) LIKE ? OR c.phone LIKE ?)");
    args.push(q, q, q, q);
  }
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.code, o.quantity, o.tip_cents, o.total_cents, o.method, o.status, o.created_at, o.expires_at, o.paid_at, o.confirmed_by,
       e.title AS event_title, e.starts_at, c.name, c.email, c.phone,
       (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id AND t.checked_in_at IS NOT NULL) AS checked_in
     FROM orders o JOIN events e ON e.id = o.event_id JOIN customers c ON c.id = o.customer_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY o.created_at DESC LIMIT 500`,
  ).bind(...args).all();
  return json({ orders: results, now: Date.now() });
};

/**
 * POST /api/admin/orders
 *   { action: "mark_paid", id }     Cash App / Venmo / PayPal / Zelle money arrived: issue tickets
 *   { action: "cancel", id }        cancel unpaid, or refund-and-void paid (refund the money in Stripe/the app)
 *   { action: "comp", event, name, email, quantity }   free tickets for guests, the band, press
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const staff = (data as { staff: { user: SessionUser; role: Role } }).staff;
  const b = (await request.json()) as Record<string, string | number>;
  const origin = new URL(request.url).origin;
  const emailFor = (id: string) =>
    env.DB.prepare("SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?").bind(id).first<string>("email");

  if (b.action === "mark_paid") {
    const id = String(b.id);
    if (await fulfillOrder(env.DB, id, { staff: staff.user.email })) {
      const view = await orderView(env.DB, id);
      const email = await emailFor(id);
      if (view && email) await sendTicketsEmail(env, origin, view, email);
    }
    return json({ order: await orderView(env.DB, id) });
  }
  if (b.action === "cancel") {
    await cancelOrder(env.DB, String(b.id));
    return json({ order: await orderView(env.DB, String(b.id)) });
  }
  if (b.action === "comp") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const name = String(b.name ?? "").trim().slice(0, 200);
    const quantity = Number(b.quantity);
    if (!name || !isEmail(email)) return fail("Add the guest's name and email.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return fail("Choose 1 to 50 tickets.");
    const customerId = await upsertCustomer(env.DB, { email, name, phone: "", optIn: false });
    const order = await reserveOrder(env.DB, { eventId: String(b.event), customerId, quantity, tipCents: 0, method: "comp", holdMs: 60_000 });
    if (!order) return fail("Not enough tickets left for that show (or it isn't published).", 409);
    await env.DB.prepare("UPDATE orders SET unit_cents = 0, total_cents = 0 WHERE id = ?").bind(order.id).run();
    await fulfillOrder(env.DB, order.id, { staff: staff.user.email });
    const view = await orderView(env.DB, order.id);
    if (view) await sendTicketsEmail(env, origin, view, email);
    return json({ order: view });
  }
  return fail("Unknown action");
};
