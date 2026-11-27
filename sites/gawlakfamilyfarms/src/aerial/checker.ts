/**
 * AT_Checker: the new-imagery check — on a customer's sign-in at most weekly
 * (staggered 0–6 days by signup date on the first), and as a full sweep on
 * request (the token-protected REST endpoint). WP-CLI's `wp aerial-timelapse
 * check` / `token` do not exist on a Worker (MIGRATION.md); the endpoint does
 * the same.
 */
import { type Ctx, setOpt } from "../ctx";
import { getUsers, registeredOf } from "../admin/core";
import { frameEntry } from "./fetcher";
import { isAtError, searchFrames } from "./naip";
import { armGlow, empty, getProperty, isoC, saveProperty } from "./property";

export const TOKEN_OPTION = "at_check_token";
export const LAST_RUN_OPTION = "at_last_check";

/** The bulk-check token: the plugin's at_check_token setting, now the AT_CHECK_TOKEN secret. */
export const token = (c: Ctx) => c.env.AT_CHECK_TOKEN ?? "";
/** verify_token() (hash_equals) */
export function verifyToken(c: Ctx, t: string): boolean {
  const e = token(c);
  if (e === "" || e.length !== t.length) return false;
  let r = 0;
  for (let i = 0; i < e.length; i++) r |= e.charCodeAt(i) ^ t.charCodeAt(i);
  return r === 0;
}

/** crc32() */
export function crc32(s: string): number {
  let c = ~0;
  for (const b of new TextEncoder().encode(s)) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}

/** on_login (the wp_login hook): this customer's check, if their weekly window is due. */
export async function onLogin(c: Ctx, uid: number): Promise<void> {
  const p = await getProperty(c, uid);
  if (!p) return;
  if (empty(p.next_check_due)) {
    const offset = crc32(await registeredOf(c, uid)) % 7;
    p.next_check_due = c.now + offset * 86400;
    await saveProperty(c, uid, p);
    return;
  }
  if (c.now < Math.trunc(Number(p.next_check_due) || 0)) return;
  await checkUser(c, uid);
}

/** check_user(): append any new frame, arm the glow, schedule the next week. */
export async function checkUser(c: Ctx, uid: number): Promise<{ updated: boolean; errors: string[] }> {
  const result = { updated: false, errors: [] as string[] };
  const p = await getProperty(c, uid);
  if (!p) return result;
  p.next_check_due = c.now + 7 * 86400;
  const frames = await searchFrames(Number(p.lat), Number(p.lng));
  if (isAtError(frames)) {
    result.errors.push(`user ${uid}: ` + frames.message);
    await saveProperty(c, uid, p);
    return result;
  }
  p.last_checked_at = isoC(c.now);
  const list: any[] = Array.isArray(p.frames) ? [...p.frames] : Object.values(p.frames ?? {});
  const known = list.map((f) => f.item_id);
  for (const f of frames) {
    if (known.includes(f.item_id)) continue;
    list.push(frameEntry(f, Number(p.lat), Number(p.lng)));
    result.updated = true;
  }
  p.frames = list;
  if (result.updated) {
    p.frames = list.map((f, i) => ({ f, i })).sort((a, b) => (a.f.date < b.f.date ? -1 : a.f.date > b.f.date ? 1 : a.i - b.i)).map((x) => x.f);
    p.latest_item_id = p.frames[p.frames.length - 1].item_id;
    p.last_updated_at = isoC(c.now);
    armGlow(c, p);
  }
  await saveProperty(c, uid, p);
  return result;
}

/** run(): every saved property (users holding at_property, by login), and the last-run record. Ids come back as text, as get_users( fields => ID ) gives them. */
export async function run(c: Ctx): Promise<{ checked: number; updated: string[]; errors: string[] }> {
  const results = { checked: 0, updated: [] as string[], errors: [] as string[] };
  for (const u of await getUsers(c, { meta_key: "at_property" })) {
    results.checked++;
    const r = await checkUser(c, u.ID);
    results.errors.push(...r.errors);
    if (r.updated) results.updated.push(String(u.ID));
  }
  await setOpt(c, LAST_RUN_OPTION, { time: isoC(c.now), checked: results.checked, updated: results.updated.length, errors: results.errors });
  return results;
}
