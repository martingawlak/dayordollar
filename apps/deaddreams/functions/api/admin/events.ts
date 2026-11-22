import type { Env } from "../../env.ts";
import { DEFAULT_PRICE_CENTS } from "../../../src/config.ts";
import { allEventsWithStats, available } from "../../lib/db.ts";
import { fail, json, newId } from "../../lib/util.ts";

/** GET /api/admin/events  every show with inventory, check-ins and revenue. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await allEventsWithStats(env.DB);
  return json({ events: rows.map((e) => ({ ...e, available: available(e) })) });
};

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** POST /api/admin/events  create (no id) or update (id) a show. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json()) as Record<string, unknown>;
  const str = (k: string, max = 500) => String(b[k] ?? "").trim().slice(0, max);
  const int = (k: string, min: number, max: number) => {
    const n = Number(b[k]);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };

  const title = str("title", 200);
  const startsAt = str("startsAt", 16);
  const doorsAt = str("doorsAt", 16) || null;
  const slug = slugify(str("slug", 80) || `${title}-${startsAt.slice(0, 10)}`);
  const priceCents = b.priceCents === undefined || b.priceCents === "" ? DEFAULT_PRICE_CENTS : int("priceCents", 0, 1_000_000);
  const capacity = int("capacity", 1, 100_000);
  const hardTickets = int("hardTickets", 0, 100_000) ?? 0;
  const maxPerOrder = int("maxPerOrder", 1, 50) ?? 10;
  const status = str("status", 20);
  if (!title) return fail("Add a title.");
  if (!WALL.test(startsAt) || (doorsAt && !WALL.test(doorsAt))) return fail("Add the show's date and time.");
  if (priceCents === null) return fail("Add a ticket price.");
  if (capacity === null) return fail("Add how many tickets there are in total.");
  if (hardTickets > capacity) return fail("Printed tickets can't be more than the total.");
  if (!["draft", "published", "cancelled"].includes(status)) return fail("Invalid status.");
  if (!slug) return fail("Add a ticket link name.");
  const imageUrl = str("imageUrl", 1000);
  const fbEventUrl = str("fbEventUrl", 1000);
  if ((imageUrl && !/^https?:\/\/|^\//.test(imageUrl)) || (fbEventUrl && !/^https:\/\//.test(fbEventUrl))) return fail("Links must start with https://");

  const now = Date.now();
  const values = [slug, title, startsAt, doorsAt, str("venue", 200), str("address", 300), str("description", 5000), imageUrl, priceCents, capacity, hardTickets, maxPerOrder, status, fbEventUrl, now];
  try {
    if (b.id) {
      const res = await env.DB.prepare(
        `UPDATE events SET slug=?1, title=?2, starts_at=?3, doors_at=?4, venue=?5, address=?6, description=?7, image_url=?8,
           price_cents=?9, capacity=?10, hard_tickets=?11, max_per_order=?12, status=?13, fb_event_url=?14, updated_at=?15 WHERE id=?16`,
      ).bind(...values, String(b.id)).run();
      if (!res.meta.changes) return fail("Show not found", 404);
      return json({ id: b.id, slug });
    }
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO events (slug, title, starts_at, doors_at, venue, address, description, image_url, price_cents, capacity,
         hard_tickets, max_per_order, status, fb_event_url, updated_at, created_at, id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16)`,
    ).bind(...values, id).run();
    return json({ id, slug });
  } catch (err) {
    if (String(err).includes("UNIQUE")) return fail("Another show already uses that ticket link name.");
    throw err;
  }
};
