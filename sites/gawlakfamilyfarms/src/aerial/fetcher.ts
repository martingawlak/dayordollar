/**
 * AT_Fetcher: geocode the address (US Census geocoder, no key), list every
 * NAIP frame there, and save the record. Frames stay on the provider (the
 * plugin's default, at_store_frames off): the record holds each frame's
 * crop URL, never the image.
 */
import { type Ctx } from "../ctx";
import { rawurlencode } from "../php";
import { AtError, type Frame, frameImageUrl, isAtError, searchFrames } from "./naip";
import { deleteProperty, isoC, type Property, saveProperty } from "./property";

export const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
export const bboxMeters = () => 90;
export const framePx = () => 512;

/** geocode( $address ): lat, lng and the matched address, or the plugin's error. */
export async function geocode(address: string): Promise<{ lat: number; lng: number; address: string } | AtError> {
  const url = CENSUS_GEOCODER + "?address=" + rawurlencode(address) + "&benchmark=Public_AR_Current&format=json";
  let body: string;
  try { body = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).text(); }
  catch (e) { return new AtError("http_request_failed", e instanceof Error ? e.message : String(e)); }
  let data: any;
  try { data = JSON.parse(body); } catch { data = null; }
  const match = data?.result?.addressMatches?.[0] ?? null;
  if (!match) return new AtError("at_geocode", "Address not found. Try the full street address including city, state and ZIP.");
  return { lat: Number(match.coordinates?.y) || 0, lng: Number(match.coordinates?.x) || 0, address: String(match.matchedAddress ?? "") };
}

/** frame_entry(): a frame's metadata and its provider image URL. */
export const frameEntry = (f: Frame, lat: number, lng: number) =>
  ({ item_id: f.item_id, date: f.date, url: frameImageUrl(f.item_id, lat, lng, bboxMeters(), framePx()) });

/** build_property( $user_id, $address ): (re)build and save a user's timelapse. */
export async function buildProperty(c: Ctx, uid: number, address: string): Promise<Property | AtError> {
  const geo = await geocode(address);
  if (isAtError(geo)) return geo;
  const frames = await searchFrames(geo.lat, geo.lng);
  if (isAtError(frames)) return frames;
  if (!frames.length) return new AtError("at_no_imagery", "No aerial imagery is available for this location yet.");
  await deleteProperty(c, uid);
  const stored = frames.map((f) => frameEntry(f, geo.lat, geo.lng));
  const now = isoC(c.now);
  const p: Property = {
    address: geo.address, lat: geo.lat, lng: geo.lng, frames: stored, latest_item_id: stored[stored.length - 1].item_id,
    last_checked_at: now, last_updated_at: now, is_new_update: false, new_update_expiry: null,
  };
  await saveProperty(c, uid, p);
  return p;
}
