import type { Env } from "../../env.ts";
import { json } from "../../lib/util.ts";

/** GET /api/admin/me  who's signed in to the admin. */
export const onRequestGet: PagesFunction<Env> = async ({ data }) => json((data as Record<string, unknown>).staff);
