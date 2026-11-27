/**
 * Scheduled work. The plugins' only WP-Cron job is GFF Drive Backup's daily
 * gff_dbk_daily_event, planned by WP-Cron for 04:01 UTC every day (it was set
 * up at 12:01 AM Eastern daylight time and 'daily' recurs every 86,400 s).
 * The Worker has ONE cron trigger (wrangler.toml) and picks the jobs due by
 * the time it fires, so more jobs can share it.
 */
import type { Ctx } from "./ctx";
import { setOpt } from "./ctx";
import { DBK_HOOK, nextRun, runBackup } from "./fppm/settings";

export const JOBS: Record<string, { due: (utc: Date) => boolean; run: (c: Ctx) => Promise<void> }> = {
  [DBK_HOOK]: { due: (d) => d.getUTCHours() === 4, run: runBackup },
};

/** The jobs due at this firing, each run and then rescheduled (cron_next:<hook>, shown on the Drive Backup page). */
export async function runDue(c: Ctx, at: Date): Promise<string[]> {
  const ran: string[] = [];
  for (const [hook, job] of Object.entries(JOBS)) {
    if (!job.due(at)) continue;
    await job.run(c);
    await setOpt(c, "cron_next:" + hook, nextRun(c));
    ran.push(hook);
  }
  return ran;
}
