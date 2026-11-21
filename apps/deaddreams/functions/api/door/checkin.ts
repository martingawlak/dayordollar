import type { SessionUser } from "@mgc/sso";
import type { Env } from "../../env.ts";
import type { Role } from "../../lib/staff.ts";
import { fail, json, today } from "../../lib/util.ts";

/** GET /api/door/checkin  shows from today on, with check-in counts, for the scanner's picker. */
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.title, e.starts_at,
       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'valid') AS tickets,
       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'valid' AND t.checked_in_at IS NOT NULL) AS checked_in
     FROM events e WHERE e.status = 'published' AND substr(e.starts_at, 1, 10) >= ? ORDER BY e.starts_at LIMIT 20`,
  ).bind(today()).all();
  return json({ events: results, staff: (data as Record<string, unknown>).staff });
};

/** POST /api/door/checkin { event, code }  let a ticket in, once. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const staff = (data as { staff: { user: SessionUser; role: Role } }).staff;
  const b = (await request.json()) as { event?: string; code?: string };
  // Accept the bare code, a pasted link, lower case, spaces and dashes.
  const code = String(b.code ?? "").toUpperCase().replace(/^.*[/=]/, "").replace(/[^0-9A-Z]/g, "");
  if (!code || !b.event) return fail("Scan a ticket.");

  const now = Date.now();
  const res = await env.DB.prepare(
    `UPDATE tickets SET checked_in_at = ?1, checked_in_by = ?2
     WHERE code = ?3 AND event_id = ?4 AND status = 'valid' AND checked_in_at IS NULL`,
  ).bind(now, staff.user.email, code, b.event).run();

  const t = await env.DB.prepare(
    `SELECT t.seq, t.status, t.event_id, t.checked_in_at, t.checked_in_by, o.quantity, o.code AS order_code, c.name, e.title
     FROM tickets t JOIN orders o ON o.id = t.order_id JOIN customers c ON c.id = o.customer_id JOIN events e ON e.id = t.event_id
     WHERE t.code = ?`,
  ).bind(code).first<{ seq: number; status: string; event_id: string; checked_in_at: number; checked_in_by: string; quantity: number; order_code: string; name: string; title: string }>();

  if (!t) return json({ ok: false, reason: "Not a Dead Dreams ticket.", code });
  const who = { name: t.name, seq: t.seq, of: t.quantity, order: t.order_code, code };
  if (res.meta.changes === 1) return json({ ok: true, ...who });
  if (t.status !== "valid") return json({ ok: false, reason: "This ticket was cancelled or refunded.", ...who });
  if (t.event_id !== b.event) return json({ ok: false, reason: `This ticket is for ${t.title}.`, ...who });
  return json({ ok: false, reason: "Already checked in.", at: t.checked_in_at, by: t.checked_in_by, ...who });
};
