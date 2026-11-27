/**
 * Fake answers for Aerial Timelapse's outside services: the US Census
 * geocoder and Microsoft Planetary Computer's NAIP catalog. Which answer
 * depends on what was asked (the address; the point's latitude), so both
 * sides get the same.
 */
import type { Handler } from "./harness";

/** Addresses the geocoder knows, by the start of what was typed. */
const PLACES: Record<string, { y: number; x: number; matched: string }> = {
  "10 grove": { y: 26.5, x: -80.25, matched: "10 GROVE RD, FORT PIERCE, FL, 34982" },
  "20 bare": { y: 25.25, x: -80.4, matched: "20 BARE LN, STUART, FL, 34994" },
  "30 down": { y: 24.5, x: -81.0, matched: "30 DOWN ST, KEY WEST, FL, 33040" },
  "4609 magnolia": { y: 27.380588264534, x: -80.312276220892, matched: "4609 MAGNOLIA DR, FORT PIERCE, FL, 34982" },
};
const F = (id: string, dt: string | null) => ({ type: "Feature", id, properties: dt === null ? {} : { datetime: dt } });

export const aerialHandler: Handler = (url, body) => {
  if (url.startsWith("/census/geocoder/locations/onelineaddress?")) {
    const addr = decodeURIComponent(/[?&]address=([^&]*)/.exec(url)?.[1] ?? "").toLowerCase();
    if (addr.startsWith("boom")) return { __status: 500, __body: "<html>down</html>" };
    const hit = Object.entries(PLACES).find(([k]) => addr.startsWith(k));
    return { result: { input: { address: { address: addr } }, addressMatches: hit ? [{ matchedAddress: hit[1].matched, coordinates: { x: hit[1].x, y: hit[1].y } }] : [] } };
  }
  if (url === "/pc/api/stac/v1/search") {
    const lat = Number(JSON.parse(body || "{}")?.intersects?.coordinates?.[1]);
    if (lat > 27.3 && lat < 27.35) return { type: "FeatureCollection", features: [] };                // user 33's spot: nothing new
    if (lat > 27.35) return { type: "FeatureCollection", features: [F("fl_m_2708038_sw_17_1_20100617", "2010-06-17T16:00:00Z"), F("fl_new_2025_a", "2025-02-01T15:00:00Z")] };
    if (lat > 26 && lat < 27) return { type: "FeatureCollection", features: [
      F("grove_2019_b", "2019-11-20T00:00:00Z"), F("grove_2013", "2013-05-01T00:00:00Z"), F("grove_2019_a", "2019-03-02T00:00:00Z"),
      F("", "2017-01-01T00:00:00Z"), F("grove_nodate", null), F("grove_2021", "2021-08-09T12:00:00Z"),
    ] };
    if (lat > 25 && lat < 26) return { type: "FeatureCollection", features: [] };
    return { __status: 503, __body: "busy" };
  }
  return undefined;
};
