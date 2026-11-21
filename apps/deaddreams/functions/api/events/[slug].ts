import type { Env } from "../../env.ts";
import { eventBySlug, publicEvent } from "../../lib/db.ts";
import { fail, json } from "../../lib/util.ts";

/** GET /api/events/:slug: one show with live ticket availability. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const e = await eventBySlug(env.DB, String(params.slug));
  if (!e || e.status === "draft") return fail("Show not found", 404);
  return json({ event: publicEvent(e) });
};
