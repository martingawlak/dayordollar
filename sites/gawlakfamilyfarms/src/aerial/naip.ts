/**
 * The imagery source (AT_NAIP_Source): USDA NAIP aerial photos via Microsoft
 * Planetary Computer — a STAC search for every frame over a point, and the
 * provider's on-demand crop URL for one frame. No key; public domain.
 */
import { phpJson, rawurlencode } from "../php";

export const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const DATA_API = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox";

/** A WP_Error: its message. */
export class AtError { constructor(public code: string, public message: string) {} }
export const isAtError = (v: unknown): v is AtError => v instanceof AtError;

export interface Frame { item_id: string; date: string }

/** search_frames( $lat, $lng ): one frame per year (the latest capture), oldest first. */
export async function searchFrames(lat: number, lng: number): Promise<Frame[] | AtError> {
  let res: Response;
  try {
    res = await fetch(STAC_SEARCH, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
      body: phpJson({ collections: ["naip"], intersects: { type: "Point", coordinates: [lng, lat] }, limit: 100 }),
    });
  } catch (e) { return new AtError("http_request_failed", e instanceof Error ? e.message : String(e)); }
  if (res.status !== 200) return new AtError("at_stac_http", "NAIP catalog search failed (HTTP " + res.status + ")");
  let data: any;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  const features = data?.features;
  if (!features || (Array.isArray(features) && !features.length) || typeof features !== "object") return [];
  let frames: Frame[] = [];
  for (const f of Object.values<any>(features)) {
    const id = f?.id, dt = f?.properties?.datetime;
    if (!id || id === "0" || !dt || dt === "0") continue;
    frames.push({ item_id: String(id), date: String(dt).slice(0, 10) });
  }
  frames = frames.map((f, i) => ({ f, i })).sort((a, b) => (a.f.date < b.f.date ? -1 : a.f.date > b.f.date ? 1 : a.i - b.i)).map((x) => x.f);
  const byYear = new Map<string, Frame>();
  for (const f of frames) byYear.set(f.date.slice(0, 4), f);
  return [...byYear.values()];
}

/** frame_image_url( $item_id, $lat, $lng, $bbox_meters, $px ): the provider's crop of one frame, centred on the point. */
export function frameImageUrl(itemId: string, lat: number, lng: number, bboxMeters: number, px: number): string {
  const halfLat = (bboxMeters / 2) / 111320;
  const halfLng = (bboxMeters / 2) / (111320 * Math.cos((lat / 180) * Math.PI));
  const bbox = [lng - halfLng, lat - halfLat, lng + halfLng, lat + halfLat].map((n) => n.toFixed(6)).join(",");
  const args: Record<string, string> = { collection: "naip", item: itemId, assets: "image", asset_bidx: "image|1,2,3" };
  return DATA_API + "/" + bbox + "/" + px + "x" + px + ".png?" + Object.entries(args).map(([k, v]) => k + "=" + rawurlencode(v)).join("&");
}
