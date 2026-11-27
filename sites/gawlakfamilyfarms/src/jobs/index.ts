/** The plugin's WP-Cron jobs, by hook name. Each takes a fresh request context. */
import type { Ctx } from "../ctx";
import { v33RunCycle } from "../admin/posts";
import { runBackup, nextRun, DBK_HOOK } from "../admin/drive";
import { setOpt } from "../ctx";

export const JOBS: Record<string, (c: Ctx) => Promise<unknown>> = {
  gff_v33_cron: v33RunCycle, // daily: the recurring invoice cycle
  gff_dbk_daily_event: runBackup, // daily at 12:01 AM site time: the Google Sheet backup (GFF Drive Backup)
};

/** WP-Cron's rescheduling: after a run, the next planned time (wp_next_scheduled() reads it; the Drive Backup page shows it). */
export const NEXT_RUN: Record<string, (c: Ctx) => number> = { [DBK_HOOK]: nextRun };
export async function runScheduled(c: Ctx, hook: string): Promise<void> {
  await JOBS[hook](c);
  if (NEXT_RUN[hook]) await setOpt(c, "cron_next:" + hook, NEXT_RUN[hook](c));
}

/**
 * Which jobs each wrangler.toml cron trigger runs (Cron Triggers are UTC). The site's clock is
 * gmt_offset -4 with no timezone_string, so the plugin's 12:01 AM site time is 04:01 UTC all year
 * (a fixed offset: WordPress does not move it for daylight saving either). A trigger not listed runs every job.
 */
export const CRON_HOOKS: Record<string, string[]> = {
  "17 9 * * *": ["gff_v33_cron"],
  "1 4 * * *": ["gff_dbk_daily_event"],
  // One trigger for both (the Workers Free plan allows 5 per account): the hour picks the job.
  "1 4,9 * * *@4": ["gff_dbk_daily_event"],
  "1 4,9 * * *@9": ["gff_v33_cron"],
};
