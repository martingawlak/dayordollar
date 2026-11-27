/** The plugin's WP-Cron jobs, by hook name. Each takes a fresh request context. */
import type { Ctx } from "../ctx";
import { v33RunCycle } from "../admin/posts";

export const JOBS: Record<string, (c: Ctx) => Promise<unknown>> = {
  gff_v33_cron: v33RunCycle, // daily: the recurring invoice cycle
};
