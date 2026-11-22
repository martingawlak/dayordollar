import type { Env } from "../../env.ts";
import { importFacebookEvents } from "../../lib/facebook.ts";
import { fail, json } from "../../lib/util.ts";

/** GET /api/admin/facebook  is the Page connected? */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => json({ connected: !!(env.FB_PAGE_ID && env.FB_PAGE_TOKEN) });

/** POST /api/admin/facebook  import (or refresh) every event on the Dead Dreams Facebook Page. */
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  try {
    return json(await importFacebookEvents(env));
  } catch (err) {
    console.error(err);
    return fail(err instanceof Error ? err.message : "Facebook import failed", 502);
  }
};
