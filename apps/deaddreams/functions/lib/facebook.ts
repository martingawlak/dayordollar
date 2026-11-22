import { DEFAULT_PRICE_CENTS } from "../../src/config.ts";
import type { Env } from "../env.ts";
import { newId, slugify, today } from "./util.ts";


interface FbEvent {
  id: string;
  name: string;
  description?: string;
  start_time: string; // "2024-05-10T20:00:00-0400": local time plus offset
  is_canceled?: boolean;
  place?: { name?: string; location?: { street?: string; city?: string; state?: string; zip?: string } };
  cover?: { source?: string };
}

/** Every event on the Page, past and upcoming (Facebook pages through 100 at a time). */
async function pageEvents(env: Env): Promise<FbEvent[]> {
  const GRAPH = env.FB_GRAPH_BASE || "https://graph.facebook.com/v21.0";
  const fields = "id,name,description,start_time,is_canceled,place,cover";
  let url: string | undefined =
    `${GRAPH}/${encodeURIComponent(env.FB_PAGE_ID!)}/events?fields=${fields}&limit=100&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN!)}`;
  const all: FbEvent[] = [];
  for (let page = 0; url && page < 50; page++) {
    const res = await fetch(url);
    const data = (await res.json()) as { data?: FbEvent[]; paging?: { next?: string }; error?: { message: string } };
    if (!res.ok) throw new Error(`Facebook: ${data.error?.message ?? res.status}`);
    all.push(...(data.data ?? []));
    url = data.paging?.next;
  }
  return all;
}

/**
 * Import the Page's events as shows. New past events become published past shows
 * (on the calendar, no tickets); new upcoming ones become drafts at the default
 * price so an admin sets the capacity and puts them on sale. Re-running updates
 * the Facebook details (title, time, venue, description, poster) and never
 * touches price, capacity, status or the ticket link.
 */
export async function importFacebookEvents(env: Env) {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw new Error("Add FB_PAGE_ID and FB_PAGE_TOKEN to the site's settings first.");
  const events = await pageEvents(env);
  const now = Date.now();
  let added = 0, updated = 0;
  for (const fb of events) {
    const startsAt = fb.start_time.slice(0, 16);
    const loc = fb.place?.location;
    const address = [loc?.street, loc?.city, [loc?.state, loc?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const fields = {
      title: fb.name.slice(0, 200),
      startsAt,
      venue: (fb.place?.name ?? "").slice(0, 200),
      address: address.slice(0, 300),
      description: (fb.description ?? "").slice(0, 5000),
      image: fb.cover?.source ?? "",
      url: `https://www.facebook.com/events/${fb.id}/`,
    };
    const existing = await env.DB.prepare("SELECT id FROM events WHERE fb_event_id = ?").bind(fb.id).first<string>("id");
    if (existing) {
      await env.DB.prepare(
        `UPDATE events SET title=?1, starts_at=?2, venue=?3, address=?4, description=?5, image_url=?6, fb_event_url=?7, updated_at=?8,
           status = CASE WHEN ?9 THEN 'cancelled' ELSE status END WHERE id=?10`,
      ).bind(fields.title, startsAt, fields.venue, fields.address, fields.description, fields.image, fields.url, now, fb.is_canceled ? 1 : 0, existing).run();
      updated++;
      continue;
    }
    const past = startsAt.slice(0, 10) < today();
    const status = fb.is_canceled ? "cancelled" : past ? "published" : "draft";
    const base = slugify(`${fb.name}-${startsAt.slice(0, 10)}`) || `show-${fb.id}`;
    for (const slug of [base, `${base}-${fb.id.slice(-6)}`]) {
      try {
        await env.DB.prepare(
          `INSERT INTO events (id, slug, title, starts_at, venue, address, description, image_url, price_cents, capacity, status, fb_event_url, fb_event_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12, ?13, ?13)`,
        ).bind(newId(), slug, fields.title, startsAt, fields.venue, fields.address, fields.description, fields.image,
          past ? 0 : DEFAULT_PRICE_CENTS, status, fields.url, fb.id, now).run();
        added++;
        break;
      } catch (err) {
        if (!String(err).includes("UNIQUE") || slug !== base) throw err;
      }
    }
  }
  return { found: events.length, added, updated };
}
