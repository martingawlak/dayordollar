import { getSessionUser } from "@mgc/sso";
import type { Env } from "../../env.ts";
import { orderView } from "../../lib/db.ts";
import { json } from "../../lib/util.ts";

/** GET /api/me/orders  a signed-in customer's paid orders from every device. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user?.email) return json({ orders: [], signedIn: false }, 401);
  const { results } = await env.DB.prepare(
    `SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE (c.sso_user_id = ?1 OR c.email = ?2) AND o.status = 'paid' ORDER BY o.created_at DESC LIMIT 50`,
  )
    .bind(user.id, user.email.toLowerCase())
    .all<{ id: string }>();
  const orders = await Promise.all(results.map((r) => orderView(env.DB, r.id)));
  return json({ orders: orders.filter(Boolean), signedIn: true, user });
};
