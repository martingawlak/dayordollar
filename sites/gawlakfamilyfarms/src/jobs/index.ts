/** The plugin's WP-Cron jobs, by hook name (gff_v33_cron: not ported yet). Each takes a fresh request context. */
import type { Ctx } from "../ctx";

export const JOBS: Record<string, (c: Ctx) => Promise<unknown>> = {};
