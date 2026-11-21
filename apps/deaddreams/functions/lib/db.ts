import { newId, randomCode, today } from "./util.ts";

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  doors_at: string | null;
  venue: string;
  address: string;
  description: string;
  image_url: string;
  price_cents: number;
  capacity: number;
  hard_tickets: number;
  max_per_order: number;
  status: string;
  fb_event_url: string;
  created_at: number;
  updated_at: number;
}

export interface EventStats extends EventRow {
  sold: number;
  held: number;
}

export interface OrderRow {
  id: string;
  code: string;
  event_id: string;
  customer_id: string;
  quantity: number;
  unit_cents: number;
  tip_cents: number;
  total_cents: number;
  method: string;
  status: string;
  stripe_session_id: string | null;
  created_at: number;
  expires_at: number;
  paid_at: number | null;
  confirmed_by: string | null;
}

/** How long an unpaid order holds its tickets. Stripe's shortest session is 30 minutes. */
export const HOLD_MS = { card: 35 * 60_000, manual: 24 * 60 * 60_000 };

/** Tickets that count against inventory: paid, or pending and still on hold. */
const TAKEN = `(SELECT COALESCE(SUM(o.quantity), 0) FROM orders o WHERE o.event_id = e.id
  AND (o.status = 'paid' OR (o.status = 'pending' AND o.expires_at > ?1)))`;

const STATS = `SELECT e.*,
  (SELECT COALESCE(SUM(o.quantity), 0) FROM orders o WHERE o.event_id = e.id AND o.status = 'paid') AS sold,
  (SELECT COALESCE(SUM(o.quantity), 0) FROM orders o WHERE o.event_id = e.id AND o.status = 'pending' AND o.expires_at > ?1) AS held
  FROM events e`;

export const available = (e: EventStats) => Math.max(0, e.capacity - e.hard_tickets - e.sold - e.held);

export function publicEvent(e: EventStats) {
  const left = available(e);
  return {
    slug: e.slug,
    title: e.title,
    startsAt: e.starts_at,
    doorsAt: e.doors_at,
    venue: e.venue,
    address: e.address,
    description: e.description,
    imageUrl: e.image_url,
    priceCents: e.price_cents,
    maxPerOrder: e.max_per_order,
    fbEventUrl: e.fb_event_url,
    cancelled: e.status === "cancelled",
    onSale: e.status === "published" && e.starts_at.slice(0, 10) >= today() && left > 0,
    available: left,
  };
}

export async function upcomingEvents(db: D1Database) {
  const { results } = await db
    .prepare(`${STATS} WHERE e.status IN ('published', 'cancelled') AND substr(e.starts_at, 1, 10) >= ?2 ORDER BY e.starts_at`)
    .bind(Date.now(), today())
    .all<EventStats>();
  return results;
}

export function eventBySlug(db: D1Database, slug: string) {
  return db.prepare(`${STATS} WHERE e.slug = ?2`).bind(Date.now(), slug).first<EventStats>();
}

export async function allEventsWithStats(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT x.*,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id = x.id AND t.checked_in_at IS NOT NULL) AS checked_in,
        (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.event_id = x.id AND o.status = 'paid') AS revenue_cents,
        (SELECT COALESCE(SUM(o.tip_cents), 0) FROM orders o WHERE o.event_id = x.id AND o.status = 'paid') AS tips_cents
       FROM (${STATS}) x ORDER BY x.starts_at DESC`,
    )
    .bind(Date.now())
    .all<EventStats & { checked_in: number; revenue_cents: number; tips_cents: number }>();
  return results;
}

/** Create or update the customer by email; returns their id. */
export async function upsertCustomer(
  db: D1Database,
  c: { email: string; name: string; phone: string; optIn: boolean; ssoUserId?: string | null },
): Promise<string> {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO customers (id, email, name, phone, marketing_opt_in, sso_user_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT (email) DO UPDATE SET
         name = excluded.name,
         phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE customers.phone END,
         marketing_opt_in = MAX(customers.marketing_opt_in, excluded.marketing_opt_in),
         sso_user_id = COALESCE(customers.sso_user_id, excluded.sso_user_id),
         updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(newId(), c.email.toLowerCase(), c.name, c.phone, c.optIn ? 1 : 0, c.ssoUserId ?? null, now)
    .first<{ id: string }>();
  return row!.id;
}

/**
 * Reserve tickets: inserts a pending order only if enough are left. A single
 * statement, so two buyers can never take the same last ticket.
 */
export async function reserveOrder(
  db: D1Database,
  o: { eventId: string; customerId: string; quantity: number; tipCents: number; method: string; holdMs: number },
): Promise<OrderRow | null> {
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const code = `DD-${randomCode(5)}`;
    try {
      const res = await db
        .prepare(
          `INSERT INTO orders (id, code, event_id, customer_id, quantity, unit_cents, tip_cents, total_cents, method, status, created_at, expires_at)
           SELECT ?2, ?3, e.id, ?4, ?5, e.price_cents, ?6, e.price_cents * ?5 + ?6, ?7, 'pending', ?1, ?8
           FROM events e
           WHERE e.id = ?9 AND e.status = 'published'
             AND e.capacity - e.hard_tickets - ${TAKEN} >= ?5`,
        )
        .bind(now, id, code, o.customerId, o.quantity, o.tipCents, o.method, now + o.holdMs, o.eventId)
        .run();
      if (!res.meta.changes) return null;
      return db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err; // order code collision: try another
    }
  }
  throw new Error("Could not allocate an order code");
}

/**
 * Mark an order paid and issue its tickets. Safe to call more than once and
 * from the success page and the Stripe webhook at the same time.
 * Returns true when this call is the one that marked it paid.
 */
export async function fulfillOrder(db: D1Database, orderId: string, by?: { sessionId?: string; staff?: string }) {
  const res = await db
    .prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?2,
         stripe_session_id = COALESCE(?3, stripe_session_id), confirmed_by = COALESCE(?4, confirmed_by)
       WHERE id = ?1 AND status IN ('pending', 'cancelled')`,
    )
    .bind(orderId, Date.now(), by?.sessionId ?? null, by?.staff ?? null)
    .run();
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<OrderRow>();
  if (!order || order.status !== "paid") return false;
  const stmts = [];
  for (let seq = 1; seq <= order.quantity; seq++) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO tickets (id, code, order_id, event_id, seq) VALUES (?, ?, ?, ?, ?)")
        .bind(newId(), randomCode(10), order.id, order.event_id, seq),
    );
  }
  await db.batch(stmts);
  return res.meta.changes === 1;
}

/** Cancel (unpaid) or refund (paid) an order and void its tickets. */
export async function cancelOrder(db: D1Database, orderId: string, onlyPending = false) {
  const res = await db
    .prepare(
      `UPDATE orders SET status = CASE status WHEN 'paid' THEN 'refunded' ELSE 'cancelled' END
       WHERE id = ? AND status ${onlyPending ? "= 'pending'" : "IN ('pending', 'paid')"}`,
    )
    .bind(orderId)
    .run();
  await db.prepare("UPDATE tickets SET status = 'void' WHERE order_id = ?").bind(orderId).run();
  return res.meta.changes === 1;
}

/** Everything the buyer's order page needs. */
export async function orderView(db: D1Database, id: string) {
  const o = await db
    .prepare(
      `SELECT o.*, e.slug, e.title, e.starts_at, e.doors_at, e.venue, e.address, e.status AS event_status, c.name AS customer_name
       FROM orders o JOIN events e ON e.id = o.event_id JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    )
    .bind(id)
    .first<OrderRow & { slug: string; title: string; starts_at: string; doors_at: string | null; venue: string; address: string; event_status: string; customer_name: string }>();
  if (!o) return null;
  const { results: tickets } = await db
    .prepare("SELECT code, seq, status, checked_in_at FROM tickets WHERE order_id = ? ORDER BY seq")
    .bind(id)
    .all<{ code: string; seq: number; status: string; checked_in_at: number | null }>();
  return {
    id: o.id,
    code: o.code,
    status: o.status === "pending" && o.expires_at < Date.now() ? "expired" : o.status,
    method: o.method,
    quantity: o.quantity,
    unitCents: o.unit_cents,
    tipCents: o.tip_cents,
    totalCents: o.total_cents,
    createdAt: o.created_at,
    expiresAt: o.expires_at,
    paidAt: o.paid_at,
    name: o.customer_name,
    event: {
      slug: o.slug,
      title: o.title,
      startsAt: o.starts_at,
      doorsAt: o.doors_at,
      venue: o.venue,
      address: o.address,
      cancelled: o.event_status === "cancelled",
    },
    tickets: tickets.map((t) => ({ code: t.code, seq: t.seq, status: t.status, checkedInAt: t.checked_in_at })),
  };
}
