/**
 * Aerial Timelapse (plugin 1.1.0): one property record per user, in the
 * at_property user meta (AT_Property). Shape: address, lat, lng, frames
 * [{item_id, date, url}], latest_item_id, last_checked_at, last_updated_at,
 * is_new_update, new_update_expiry, and next_check_due once a login check has
 * been scheduled.
 */
import { type Ctx, deleteMeta, meta, setMeta } from "../ctx";

export const META_KEY = "at_property";
export const GLOW_DAYS = 30;
export const AT_VERSION = "1.1.0";
export const AT_PLUGIN_URL = "https://gawlakfamilyfarms.com/wp-content/plugins/aerial-timelapse/";

export type Property = Record<string, any>;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object";
/** PHP empty() */
export const empty = (v: unknown) => v === undefined || v === null || v === false || v === 0 || v === "" || v === "0" || (isObj(v) && Object.keys(v).length === 0);

/** gmdate( 'c', $t ) */
export const isoC = (t: number) => new Date(t * 1000).toISOString().slice(0, 19) + "+00:00";
/** strtotime() of an ISO 8601 date-time; NaN when unreadable (PHP false). */
export const strtotimeIso = (s: unknown) => { const t = Date.parse(String(s)); return Number.isNaN(t) ? NaN : Math.floor(t / 1000); };

/** AT_Property::get(): the record, or null; an expired glow is cleared (and saved) as it is read. */
export async function getProperty(c: Ctx, uid: number): Promise<Property | null> {
  const v = await meta(c, uid, META_KEY);
  if (!isObj(v) || Array.isArray(v) || empty(v.lat)) return null;
  const p: Property = { ...v };
  if (!empty(p.is_new_update) && !empty(p.new_update_expiry) && strtotimeIso(p.new_update_expiry) < c.now) {
    p.is_new_update = false;
    p.new_update_expiry = null;
    await saveProperty(c, uid, p);
  }
  return p;
}
export const saveProperty = (c: Ctx, uid: number, p: Property) => setMeta(c, uid, META_KEY, p);

/** AT_Property::delete(): frames are never stored on the server (store_frames is off), so only the record goes. */
export async function deleteProperty(c: Ctx, uid: number): Promise<void> {
  await getProperty(c, uid);
  await deleteMeta(c, uid, META_KEY);
}

/** AT_Property::arm_glow(): the 30-day "new imagery" glow. */
export function armGlow(c: Ctx, p: Property): void {
  p.is_new_update = true;
  p.new_update_expiry = isoC(c.now + GLOW_DAYS * 86400);
}
/** AT_Property::is_glowing() */
export const isGlowing = (c: Ctx, p: Property) => !empty(p.is_new_update) && !empty(p.new_update_expiry) && strtotimeIso(p.new_update_expiry) > c.now;
