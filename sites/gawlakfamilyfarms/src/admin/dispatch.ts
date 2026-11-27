/**
 * Dispatch and routes (gff-customer-registration.php §14–16): the unified
 * request feed and its status store, geocoding (Google with the
 * GOOGLE_GEOCODE_KEY secret, else Nominatim) cached in gff_geo_cache, the
 * nearest-neighbour route order, OSRM drive times cached in
 * gff_route_dir_cache, and the SVG route preview. Same budgets, caches and
 * sentinels as the plugin.
 */
import { type Ctx, meta, opt, setOpt } from "../ctx";
import { esc, phpFloat, phpInt, phpJson, phpNum, phpRound, rawurlencode, truthy } from "../php";
import { md5 } from "../md5";
import { currentTs } from "../wpcore";
import { isArr, str } from "../forms/express";
import { getUsers, humanTimeDiff, mysqlTs, trimWords } from "./core";
import { classOf, type ClientRow } from "./clients";

const DAY = 86400;
const lowerAscii = (s: string) => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());

/** gff_dash_tel(): digits (and +) only, for tel:/sms: links. */
export const dashTel = (p: unknown) => str(p).replace(/[^0-9+]/g, "");

/** gff_dispatch_ago(). */
export function dispatchAgo(c: Ctx, mysql: string): string {
  let t = mysqlTs(mysql);
  if (!t) return "";
  const now = currentTs(c);
  if (t > now) t = now;
  return humanTimeDiff(t, now) + " ago";
}
/** gff_dispatch_age_class(): hot / warm / amber / cool / aged, or done once consulted. */
export function dispatchAgeClass(c: Ctx, mysql: string, consulted = false): string {
  if (consulted) return "done";
  const t = mysqlTs(mysql);
  if (!t) return "aged";
  const h = (currentTs(c) - t) / 3600;
  if (h < 1) return "hot";
  if (h < 4) return "warm";
  if (h < 12) return "amber";
  if (h < 24) return "cool";
  return "aged";
}

/* ---- Status store ---- */
export function dispatchStatusAll(c: Ctx): Record<string, any> {
  const s = opt(c, "gff_dispatch_status", []);
  return isArr(s) && !Array.isArray(s) ? (s as Record<string, any>) : Array.isArray(s) ? Object.assign({}, s) : {};
}
export async function dispatchStatusSet(c: Ctx, id: string, patch: Record<string, unknown>): Promise<void> {
  let all = { ...dispatchStatusAll(c) };
  const cur = isArr(all[id]) ? all[id] : {};
  all[id] = { ...cur, ...patch };
  const keys = Object.keys(all);
  if (keys.length > 1000) all = Object.fromEntries(keys.slice(-1000).map((k) => [k, all[k]]));
  await setOpt(c, "gff_dispatch_status", all);
}

export interface Dispatch { id: string; user_id: number; name: string; phone: unknown; email: string; type: string; type_label: string; time: string; summary: string; ts: number }

/** gff_collect_dispatches(): every customer request in the window, newest first. */
export async function collectDispatches(c: Ctx, days = 30, limit = 150): Promise<Dispatch[]> {
  const cutoff = currentTs(c) - days * DAY;
  const users = await getUsers(c, { role__in: ["gff_customer", "gff_lead"] });
  const out: Dispatch[] = [];
  for (const u of users) {
    const uid = u.ID;
    let name = (str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name"))).trim();
    if (name === "") name = u.display_name;
    const phone = await meta(c, uid, "gff_phone");
    const email = u.user_email;
    const push = (type: string, label: string, time: unknown, summary: string) => {
      const ts = mysqlTs(str(time));
      if (!ts || ts < cutoff) return;
      out.push({ id: md5(uid + "|" + type + "|" + str(time) + "|" + summary), user_id: uid, name, phone, email, type, type_label: label, time: str(time), summary, ts });
    };
    const msgs = await meta(c, uid, "gff_acct_messages");
    if (isArr(msgs)) {
      for (const m of Object.values(msgs) as any[]) {
        if (!m || !m.time) continue;
        push("message", "Message", m.time, trimWords(str(m.msg !== undefined && m.msg !== null ? m.msg : ""), 18, "&hellip;"));
      }
    }
    const su: any = await meta(c, uid, "gff_spire_unlock_request");
    if (isArr(su) && su.time) push("spire", "Spire", su.time, "Spire design unlock ($100) - " + (su.status !== undefined && su.status !== null ? str(su.status) : ""));
    const sa: any = await meta(c, uid, "gff_spire_addon_request");
    if (isArr(sa) && sa.time) {
      push("spire", "Spire", sa.time, phpInt(sa.qty !== undefined && sa.qty !== null ? sa.qty : 0) + " Spire(s) requested - $" + (sa.monthly !== undefined && sa.monthly !== null ? str(sa.monthly) : "?") + "/mo");
    }
    const res = await meta(c, uid, "gff_reservation");
    if (str(res) && res !== "none" && res !== "0") {
      const paidAt = await meta(c, uid, "gff_reservation_paid_at");
      const paid = (await meta(c, uid, "gff_reservation_paid")) === "yes";
      const reg = await c.env.DB.prepare("select registered from wp_users where id = ?").bind(uid).first<{ registered: string }>();
      const rt = str(paidAt) && paidAt !== "0" ? paidAt : reg?.registered ?? "";
      const r = str(res).replace(/_/g, " ");
      push("consult", "Consult", rt, r.charAt(0).toUpperCase() + r.slice(1) + (paid ? " - paid" : " - awaiting payment"));
    }
    const leadAt = await meta(c, uid, "gff_lead_at");
    if (str(leadAt) && leadAt !== "0") push("lead", "Lead", leadAt, "New lead - " + str(await meta(c, uid, "gff_lead_city")));
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

/* ---- Routes ---- */
export interface Stop { uid: number; name: string; addr: string; coords?: [number, number] | null }
type Budget = { n: number };

/** gff_route_active_stops(): every paid client with a service address. */
export async function routeActiveStops(c: Ctx, clients: ClientRow[]): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (const cl of clients) {
    if ((await classOf(c, cl.id)) !== "customer") continue;
    if (cl.address.trim() === "") continue;
    const addr = (cl.address + ", " + cl.city + " " + cl.zip).replace(/^[, \t\n\r\0\x0B]+|[, \t\n\r\0\x0B]+$/g, "");
    stops.push({ uid: cl.id, name: truthy(cl.name) ? cl.name : cl.email, addr });
  }
  return stops;
}

/** The address's cache key: md5( strtolower( $addr ) ). */
const geoKey = (addr: string) => md5(lowerAscii(addr));

/** gff_geocode_cached(): [lat, lng] from the cache, else one budgeted lookup (Google with the key, else Nominatim). */
export async function geocodeCached(c: Ctx, addr0: string, budget: Budget): Promise<[number, number] | null> {
  const addr = addr0.trim();
  if (addr === "") return null;
  const c0 = opt(c, "gff_geo_cache", []);
  let cache: Record<string, any> = isArr(c0) ? { ...(c0 as Record<string, any>) } : {};
  const key = geoKey(addr);
  if (Object.prototype.hasOwnProperty.call(cache, key)) return Array.isArray(cache[key]) ? (cache[key] as [number, number]) : null;
  if (budget.n <= 0) return null;
  let coords: [number, number] | null = null;
  const gkey = (c.env.GOOGLE_GEOCODE_KEY ?? "").trim();
  try {
    if (gkey !== "") {
      const res = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address=" + rawurlencode(addr) + "&key=" + rawurlencode(gkey), { signal: AbortSignal.timeout(8000) });
      const b: any = JSON.parse(await res.text());
      const loc = b?.results?.[0]?.geometry?.location;
      if (loc && (isArr(loc) && Object.keys(loc).length)) coords = [phpFloat(loc.lat), phpFloat(loc.lng)];
    } else {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + rawurlencode(addr), {
        signal: AbortSignal.timeout(8000), headers: { "User-Agent": "GawlakFamilyFarms/1.0 (" + str(opt(c, "admin_email", "")) + ")" },
      });
      const b: any = JSON.parse(await res.text());
      const lat = b?.[0]?.lat;
      if (lat !== undefined && lat !== null && lat !== "" && lat !== "0" && lat !== 0) coords = [phpFloat(lat), phpFloat(b[0].lon)];
    }
  } catch { /* is_wp_error / bad JSON: nothing found */ }
  budget.n--;
  cache[key] = coords ? coords : "none";
  const keys = Object.keys(cache);
  if (keys.length > 2000) cache = Object.fromEntries(keys.slice(-2000).map((k) => [k, cache[k]]));
  await setOpt(c, "gff_geo_cache", cache);
  return coords;
}

const rad = (d: number) => (d * Math.PI) / 180;
/** gff_haversine(): great-circle miles. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 3958.8, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** gff_route_order_nn(): nearest-neighbour from the origin; unlocated stops keep their place at the end. */
export function routeOrderNn(origin: [number, number] | null, stops: Stop[]): Stop[] {
  const located = stops.filter((s) => Array.isArray(s.coords));
  const missing = stops.filter((s) => !Array.isArray(s.coords));
  if (!origin || located.length < 2) return [...located, ...missing];
  const ordered: Stop[] = [];
  let cur = origin;
  while (located.length) {
    let bi = 0, bd = Infinity;
    located.forEach((s, i) => { const d = haversine(cur, s.coords!); if (d < bd) { bd = d; bi = i; } });
    ordered.push(located[bi]);
    cur = located[bi].coords!;
    located.splice(bi, 1);
  }
  return [...ordered, ...missing];
}
/** gff_route_origin(). */
export const routeOrigin = (c: Ctx) => str(opt(c, "gff_route_origin", "366 E Midway Road, Fort Pierce, FL"));
/** gff_route_optimize(): geocode (6 new lookups at most) and order; how many are still unlocated. */
export async function routeOptimize(c: Ctx, stops: Stop[]): Promise<[Stop[], number]> {
  if (stops.length < 2) return [stops, 0];
  const budget = { n: 6 };
  const origin = await geocodeCached(c, routeOrigin(c), budget);
  let missing = 0;
  for (const s of stops) {
    s.coords = await geocodeCached(c, s.addr, budget);
    if (!Array.isArray(s.coords)) missing++;
  }
  return [routeOrderNn(origin, stops), missing];
}
/** gff_route_maps_url(): origin → up to 9 stops in Google Maps. */
export function routeMapsUrl(c: Ctx, stops: Stop[]): string {
  if (!stops.length) return "";
  const addrs = stops.slice(0, 9).map((s) => s.addr);
  const dest = addrs.pop()!;
  let url = "https://www.google.com/maps/dir/?api=1&origin=" + rawurlencode(routeOrigin(c)) + "&destination=" + rawurlencode(dest);
  if (addrs.length) url += "&waypoints=" + addrs.map(rawurlencode).join("%7C");
  return url;
}

/** gff_decode_polyline() (precision 5). */
export function decodePolyline(s: string, precision = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const factor = 10 ** precision, coords: [number, number][] = [];
  const len = s.length;
  while (index < len) {
    let shift = 0, result = 0, b: number;
    const ch = (i: number) => (i < len ? s.charCodeAt(i) : 0); // past the end PHP reads '' (ord 0)
    do { b = ch(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && index < len);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = ch(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && index < len);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

export interface Directions { duration: number; distance: number; points: [number, number][] }
/** gff_route_directions(): drive time, distance and road shape for origin + stops (OSRM), cached by the ordered points. */
export async function routeDirections(c: Ctx, origin: [number, number] | null, stops: Stop[], budget: Budget): Promise<Directions | null> {
  const pts: [number, number][] = [];
  if (Array.isArray(origin)) pts.push(origin);
  for (const s of stops) if (Array.isArray(s.coords)) pts.push(s.coords);
  if (pts.length < 2) return null;
  const key = md5(phpJson(pts));
  const c0 = opt(c, "gff_route_dir_cache", []);
  let cache: Record<string, any> = isArr(c0) ? { ...(c0 as Record<string, any>) } : {};
  if (Object.prototype.hasOwnProperty.call(cache, key)) return isArr(cache[key]) ? (cache[key] as Directions) : null;
  if (budget.n <= 0) return null;
  const coordstr = pts.map((p) => phpNum(p[1]) + "," + phpNum(p[0])).join(";");
  let out: Directions | null = null;
  try {
    const res = await fetch("https://router.project-osrm.org/route/v1/driving/" + coordstr + "?overview=simplified&geometries=polyline", {
      signal: AbortSignal.timeout(12000), headers: { "User-Agent": "GawlakFamilyFarms/1.0 (" + str(opt(c, "admin_email", "")) + ")" },
    });
    const b: any = JSON.parse(await res.text());
    const r0 = b?.routes?.[0];
    if (r0 && (!isArr(r0) || Object.keys(r0).length)) {
      out = { duration: phpFloat(r0.duration), distance: phpFloat(r0.distance), points: r0.geometry !== undefined && r0.geometry !== null ? decodePolyline(str(r0.geometry)) : [] };
    }
  } catch { /* no route */ }
  budget.n--;
  cache[key] = out ? out : "none";
  const keys = Object.keys(cache);
  if (keys.length > 500) cache = Object.fromEntries(keys.slice(-500).map((k) => [k, cache[k]]));
  await setOpt(c, "gff_route_dir_cache", cache);
  return out;
}

/** gff_fmt_duration(): "1 hr 23 min" / "45 min". */
export function fmtDuration(sec: number): string {
  const m = Math.trunc(phpRound(sec / 60));
  if (m < 60) return m + " min";
  const h = Math.trunc(m / 60), mm = m % 60;
  return h + " hr" + (mm ? " " + mm + " min" : "");
}

/** gff_route_preview_svg(): road path, numbered stops and the origin star. */
export function routePreviewSvg(dir: Directions, stops: Stop[], origin: [number, number] | null): string {
  const line = dir.points ?? [];
  if (line.length < 2) return "";
  const all = [...line];
  if (Array.isArray(origin)) all.push(origin);
  for (const s of stops) if (Array.isArray(s.coords)) all.push(s.coords);
  const lats = all.map((p) => p[0]), lngs = all.map((p) => p[1]);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
  const spanLa = Math.max(1e-6, maxLa - minLa), spanLo = Math.max(1e-6, maxLo - minLo);
  const W = 600, H = 300, pad = 26;
  const proj = (la: number, lo: number): [number, number] => [phpRound(pad + ((lo - minLo) / spanLo) * (W - 2 * pad), 1), phpRound(pad + ((maxLa - la) / spanLa) * (H - 2 * pad), 1)];
  let d = "";
  line.forEach((p, i) => { const [x, y] = proj(p[0], p[1]); d += (i ? "L" : "M") + phpNum(x) + " " + phpNum(y) + " "; });
  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">';
  svg += '<rect width="' + W + '" height="' + H + '" fill="#eef3e9" rx="10"/>';
  svg += '<path d="' + esc(d.trim()) + '" fill="none" stroke="#1c1c1a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
  if (Array.isArray(origin)) {
    const [ox, oy] = proj(origin[0], origin[1]);
    svg += '<circle cx="' + phpNum(ox) + '" cy="' + phpNum(oy) + '" r="9" fill="#1c1c1a"/><text x="' + phpNum(ox) + '" y="' + phpNum(oy + 3.5) + '" font-size="10" fill="#fff" text-anchor="middle" font-family="sans-serif">&#9733;</text>';
  }
  let n = 0;
  for (const s of stops) {
    if (!Array.isArray(s.coords)) continue;
    n++;
    const [sx, sy] = proj(s.coords[0], s.coords[1]);
    svg += '<circle cx="' + phpNum(sx) + '" cy="' + phpNum(sy) + '" r="10" fill="#c75c2e" stroke="#fff" stroke-width="2"/>';
    svg += '<text x="' + phpNum(sx) + '" y="' + phpNum(sy + 4) + '" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">' + n + "</text>";
  }
  return svg + "</svg>";
}
