import type { Env } from "../../env.ts";
import { calendarEvents, publicEvent, upcomingEvents } from "../../lib/db.ts";
import { fail, json } from "../../lib/util.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/events                         upcoming shows, soonest first
 * GET /api/events?from=YYYY-MM-DD&to=...  every show in that range, past ones included (the calendar)
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const p = new URL(request.url).searchParams;
  const from = p.get("from"), to = p.get("to");
  if (from || to) {
    if (!from || !to || !DAY.test(from) || !DAY.test(to) || from > to) return fail("Use from and to as YYYY-MM-DD.");
    return json({ events: (await calendarEvents(env.DB, from, to)).map(publicEvent) });
  }
  return json({ events: (await upcomingEvents(env.DB)).map(publicEvent) });
};
