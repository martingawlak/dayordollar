import type { Env } from "../../env.ts";
import { publicEvent, upcomingEvents } from "../../lib/db.ts";
import { json } from "../../lib/util.ts";

/** GET /api/events: upcoming published shows, soonest first. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  json({ events: (await upcomingEvents(env.DB)).map(publicEvent) });
