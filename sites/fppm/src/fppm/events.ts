/**
 * Section 10d: the schedule (matches, practices, conditioning, team events),
 * RSVPs (players to everything, supporters to matches, fans view), the
 * add-to-calendar links (Google, .ics for Apple/Outlook, Outlook.com, map),
 * the seeded Saturday conditioning, and the staff's add/delete handlers.
 *
 * Times: the plugin reads an event's date and time with PHP's date() and
 * strtotime(), which WordPress runs in UTC, and prints them with date_i18n()
 * — so "08:00" is stored, shown and put in calendars as 08:00, and "now" for
 * picking the next weekly session is UTC. Kept exactly.
 *
 * Storage: fppm_events, with each event's rsvps as [uid, status] pairs in the
 * order people answered (a JSON object would reorder numeric keys).
 */
import { type Ctx, adminUrl, homeUrl, opt, setOpt } from "../ctx";
import { esc, escUrl, gmdate, phpFloat, phpInt, phpNum, rawurlencode, truthy } from "../php";
import { sanitizeKey, sanitizeTextField } from "../wpfn";
import { DieReply, httpBuildQuery, type RedirectReply } from "../wp";
import type { AjaxCtx } from "../ajax";
import { canManage, displayName, isArr, redirectNote, str, typeOf } from "./core";
import { nonceField, selected } from "./ui";

export type Rsvp = [number, string];
export interface FEvent { id?: number; type?: string; recur?: string; weekday?: number | string; title?: string; date?: string; time?: string; end?: string;
  location?: string; lat?: string; lng?: string; notes?: string; rsvps?: Rsvp[] | Record<string, string>; [k: string]: unknown }

const DAY = 86400, HOUR = 3600, WEEK = 604800;
export const EVENT_TYPES: Record<string, string> = { match: "Match", practice: "Practice", conditioning: "Conditioning", event: "Team event" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hasKey = (o: object, k: unknown) => (typeof k === "string" || typeof k === "number") && Object.prototype.hasOwnProperty.call(o, String(k));

/** An event's RSVPs as pairs, whatever shape they were stored in. */
export function rsvpsOf(e: FEvent): Rsvp[] {
  const r = e.rsvps;
  if (Array.isArray(r)) return r.filter((x) => Array.isArray(x)) as Rsvp[];
  if (isArr(r)) return Object.entries(r).map(([k, v]) => [Number(k), str(v)]);
  return [];
}
/** empty( $e['rsvps'] ): no answers yet (or nothing usable stored). */
const rsvpEmpty = (e: FEvent) => !truthy(e.rsvps) || (isArr(e.rsvps) && Object.keys(e.rsvps).length === 0);

export function eventsGet(c: Ctx): FEvent[] {
  const e = opt(c, "fppm_events", []);
  return Array.isArray(e) ? e : isArr(e) ? Object.values(e) : [];
}
export const eventsSave = (c: Ctx, events: FEvent[]) => setOpt(c, "fppm_events", events);
export const isWeekly = (e: FEvent) => e.recur === "weekly";

/**
 * strtotime() for what the plugin hands it: "today", or "[Y-m-d] [H:MM[:SS] [am|pm]]" (a missing
 * date is today), in UTC. Out-of-range days roll over as PHP's do. null where PHP gives false.
 */
export function strtotime(raw: string, now: number): number | null {
  const s = raw.trim().toLowerCase();
  const today = Math.floor(now / DAY) * DAY;
  if (s === "today" || s === "midnight") return today;
  const m = /^(?:(\d{4})-(\d{1,2})-(\d{1,2}))?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)?$/.exec(s);
  if (!m || s === "" || (m[2] && (+m[2] < 1 || +m[2] > 12)) || (m[3] && (+m[3] < 1 || +m[3] > 31))) return null;
  let h = m[4] !== undefined ? +m[4] : 0;
  const min = m[5] !== undefined ? +m[5] : 0, sec = m[6] !== undefined ? +m[6] : 0;
  if (min > 59 || sec > 60) return null;
  if (m[7]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[7].startsWith("p") ? 12 : 0); }
  else if (h > 24) return null;
  const base = m[1] ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : today;
  return base + h * HOUR + min * 60 + sec;
}
const ymd = (ts: number) => gmdate("Y-m-d", ts);

/** fppm_event_ts(): the next start (weekly: this week's, or next week's once today's has ended). */
export function eventTs(c: Ctx, e: FEvent): number {
  const time = truthy(e.time) ? str(e.time) : "00:00";
  if (isWeekly(e)) {
    const wd = e.weekday !== undefined && e.weekday !== null ? phpInt(e.weekday) : 6;
    const now = c.now;
    const ahead = (wd - new Date(now * 1000).getUTCDay() + 7) % 7;
    let start = strtotime(ymd(now + ahead * DAY) + " " + time, now);
    if (ahead === 0 && start) {
      const end = truthy(e.end) ? strtotime(ymd(now) + " " + str(e.end), now) : start + HOUR;
      if (now > (end === null ? 0 : end)) start += WEEK;
    }
    return start ? start : 0;
  }
  const ts = strtotime((e.date !== undefined && e.date !== null ? str(e.date) : "") + " " + time, c.now);
  return ts ? ts : 0;
}
export function eventEndTs(c: Ctx, e: FEvent): number {
  const start = eventTs(c, e);
  if (!start) return 0;
  if (truthy(e.end)) {
    const end = strtotime(ymd(start) + " " + str(e.end), c.now);
    if (end && end > start) return end;
  }
  return start + HOUR;
}
export function eventsUpcoming(c: Ctx): FEvent[] {
  const today = strtotime("today", c.now)!;
  return eventsGet(c).filter((e) => isWeekly(e) || eventTs(c, e) >= today).sort((a, b) => eventTs(c, a) - eventTs(c, b));
}
export const eventNext = (c: Ctx) => eventsUpcoming(c)[0] ?? null;
export function eventLabel(e: FEvent): string {
  const type = hasKey(EVENT_TYPES, e.type) ? EVENT_TYPES[str(e.type)] : "Event";
  const title = e.title !== undefined && e.title !== null ? str(e.title) : "";
  if (e.type === "match") return truthy(title) ? "Match vs " + title : "Match";
  return truthy(title) ? type + " — " + title : type;
}
export function eventWhen(c: Ctx, e: FEvent): string {
  const ts = eventTs(c, e);
  if (!ts) return "";
  let tp = "";
  if (truthy(e.time)) {
    tp = gmdate("g:i", ts);
    tp += truthy(e.end) ? "–" + gmdate("g:i A", eventEndTs(c, e)) : " " + gmdate("A", ts);
  }
  if (isWeekly(e)) {
    const wd = e.weekday !== undefined && e.weekday !== null ? phpInt(e.weekday) : 6;
    return "Every " + (WEEKDAYS[wd] ?? "") + (truthy(tp) ? " · " + tp : "") + " · next " + gmdate("M j", ts);
  }
  return gmdate("D, M j", ts) + (truthy(tp) ? " · " + tp : "");
}

/** fppm_tz(): wp_timezone_string(). */
export function tz(c: Ctx): string {
  const t = str(opt(c, "timezone_string", ""));
  if (t) return t;
  const off = phpFloat(opt(c, "gmt_offset", 0));
  const h = Math.trunc(off), m = Math.abs(off - h) * 60;
  return (off < 0 ? "-" : "+") + String(Math.abs(h)).padStart(2, "0") + ":" + String(Math.round(m)).padStart(2, "0");
}
export const hasGeo = (e: FEvent) => e.lat !== undefined && e.lat !== null && e.lng !== undefined && e.lng !== null && e.lat !== "" && e.lng !== "";
export const locationLabel = (e: FEvent) => (e.location !== undefined && e.location !== null ? str(e.location) : "");
export function mapUrl(e: FEvent): string {
  if (hasGeo(e)) return "https://www.google.com/maps/search/?api=1&query=" + rawurlencode(str(e.lat) + "," + str(e.lng));
  if (truthy(e.location)) return "https://www.google.com/maps/search/?api=1&query=" + rawurlencode(str(e.location));
  return "";
}
export function icsByday(wd: unknown): string { const m = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; return m[phpInt(wd)] ?? "SA"; }
const calLoc = (e: FEvent) => (locationLabel(e) + (hasGeo(e) ? " (" + str(e.lat) + ", " + str(e.lng) + ")" : "")).trim();
const calDetails = (e: FEvent) => ((e.notes !== undefined && e.notes !== null ? str(e.notes) : "") + (mapUrl(e) ? "\nMap: " + mapUrl(e) : "")).trim();
/** date( 'c', $ts ) under UTC. */
const isoC = (ts: number) => gmdate("Y-m-d\\TH:i:s", ts) + "+00:00";
export function gcalUrl(c: Ctx, e: FEvent): string {
  const args: Record<string, string> = {
    action: "TEMPLATE", text: eventLabel(e), dates: gmdate("Ymd\\THis", eventTs(c, e)) + "/" + gmdate("Ymd\\THis", eventEndTs(c, e)),
    ctz: tz(c), location: calLoc(e), details: calDetails(e),
  };
  if (isWeekly(e)) args.recur = "RRULE:FREQ=WEEKLY;BYDAY=" + icsByday(e.weekday !== undefined && e.weekday !== null ? e.weekday : 6);
  return "https://calendar.google.com/calendar/render?" + httpBuildQuery(args);
}
export function outlookUrl(c: Ctx, e: FEvent): string {
  return "https://outlook.live.com/calendar/0/deeplink/compose?" + httpBuildQuery({
    path: "/calendar/action/compose", rru: "addevent", subject: eventLabel(e), startdt: isoC(eventTs(c, e)), enddt: isoC(eventEndTs(c, e)), location: calLoc(e), body: calDetails(e),
  });
}
const eid = (e: FEvent) => phpInt(e.id !== undefined && e.id !== null ? e.id : 0);
export const icsUrl = (c: Ctx, e: FEvent) => homeUrl(c, "/?fppm_ics=" + eid(e));
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
export function eventIcs(c: Ctx, e: FEvent): string {
  const host = new URL(c.origin).hostname;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FPPM//Team Manager//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    "UID:fppm-" + eid(e) + "@" + host, "DTSTAMP:" + gmdate("Ymd\\THis\\Z", c.now), "DTSTART:" + gmdate("Ymd\\THis", eventTs(c, e)), "DTEND:" + gmdate("Ymd\\THis", eventEndTs(c, e)),
    "SUMMARY:" + icsEsc(eventLabel(e))];
  if (calLoc(e)) lines.push("LOCATION:" + icsEsc(calLoc(e)));
  if (calDetails(e)) lines.push("DESCRIPTION:" + icsEsc(calDetails(e)));
  if (hasGeo(e)) lines.push("GEO:" + phpNum(phpFloat(e.lat)) + ";" + phpNum(phpFloat(e.lng)));
  if (isWeekly(e)) lines.push("RRULE:FREQ=WEEKLY;BYDAY=" + icsByday(e.weekday !== undefined && e.weekday !== null ? e.weekday : 6));
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
/** fppm_ics_serve(): /?fppm_ics=<id> — one event as an .ics download (404 when there is no such event). */
export function icsServe(c: Ctx, idRaw: string): Response {
  const id = phpInt(idRaw);
  const ev = eventsGet(c).find((e) => eid(e) === id);
  if (!ev) return new Response("", { status: 404 });
  return new Response(eventIcs(c, ev), { headers: {
    "Cache-Control": "no-cache, must-revalidate, max-age=0, no-store, private", Expires: "Wed, 11 Jan 1984 05:00:00 GMT",
    "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="fppm-event-' + id + '.ics"',
  } });
}
export function calendarHtml(c: Ctx, e: FEvent): string {
  const b = '<a class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" href="';
  return '<div class="fppm-actions" style="margin-top:.4em;">'
    + b + escUrl(gcalUrl(c, e)) + '" target="_blank" rel="noopener">+ Google</a>'
    + b + escUrl(icsUrl(c, e)) + '">+ Apple / Outlook</a>'
    + b + escUrl(outlookUrl(c, e)) + '" target="_blank" rel="noopener">+ Outlook.com</a>'
    + (mapUrl(e) ? b + escUrl(mapUrl(e)) + '" target="_blank" rel="noopener">📍 Map</a>' : "")
    + "</div>";
}
export function canRsvp(eventType: unknown, memberType: string): boolean {
  if (memberType === "player") return true;
  if (memberType === "supporter") return eventType === "match";
  return false;
}
export function rsvpCounts(e: FEvent): Record<"in" | "maybe" | "out", number> {
  const cnt = { in: 0, maybe: 0, out: 0 };
  if (truthy(e.rsvps) && isArr(e.rsvps)) for (const [, s] of rsvpsOf(e)) if (hasKey(cnt, s)) cnt[s as "in"]++;
  return cnt;
}

/** fppm_seed_events() (every request, as on 'init'): the standing Saturday conditioning, once. */
export async function seedEvents(c: Ctx): Promise<void> {
  if (truthy(opt(c, "fppm_seed_conditioning", false))) return;
  const events = eventsGet(c);
  let maxid = 0;
  for (const e of events) if (truthy(e.id) && phpFloat(e.id) > maxid) maxid = phpInt(e.id);
  events.push({ id: maxid + 1, type: "conditioning", recur: "weekly", weekday: 6, title: "", date: "", time: "08:00", end: "09:00", location: "Dan McCarty Track",
    lat: "27.431200215726122", lng: "-80.33686374487264", notes: "Players meet at the Dan McCarty Track parking lot for conditioning.", rsvps: [] });
  await eventsSave(c, events);
  await setOpt(c, "fppm_seed_conditioning", "1");
}

/* ---- handlers (admin-post.php) ---- */
const post = (c: AjaxCtx, k: string) => (c.post[k] !== undefined ? str(c.post[k]) : undefined);
export async function addEvent(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  let type = post(c, "etype") !== undefined ? sanitizeKey(post(c, "etype")) : "match";
  if (!hasKey(EVENT_TYPES, type)) type = "event";
  const recur = post(c, "erecur") === "weekly" ? "weekly" : "none";
  const date = post(c, "edate") !== undefined ? sanitizeTextField(post(c, "edate")) : "";
  const weekday = post(c, "eweekday") !== undefined ? phpInt(post(c, "eweekday")) : 6;
  if (recur !== "weekly" && date === "") return redirectNote(c, "err");
  const coords = post(c, "ecoords") !== undefined ? sanitizeTextField(post(c, "ecoords")) : "";
  let lat = "", lng = "";
  const m = truthy(coords) ? /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(coords) : null;
  if (m) { lat = m[1]; lng = m[2]; }
  const events = eventsGet(c);
  let maxid = 0;
  for (const e of events) if (truthy(e.id) && phpFloat(e.id) > maxid) maxid = phpInt(e.id);
  const f = (k: string) => (post(c, k) !== undefined ? sanitizeTextField(post(c, k)) : "");
  events.push({ id: maxid + 1, type, recur, weekday, title: f("etitle"), date, time: f("etime"), end: f("eend"), location: f("eloc"), lat, lng, notes: f("enotes"), rsvps: [] });
  await eventsSave(c, events);
  return redirectNote(c, "eventadded");
}
export async function deleteEvent(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const id = post(c, "id") !== undefined ? phpInt(post(c, "id")) : 0;
  await eventsSave(c, eventsGet(c).filter((e) => eid(e) !== id));
  return redirectNote(c, "eventdeleted");
}
export async function rsvp(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  const uid = c.uid;
  if (!uid) return new DieReply("Sign in.");
  const id = post(c, "id") !== undefined ? phpInt(post(c, "id")) : 0;
  const status = post(c, "status") !== undefined ? sanitizeKey(post(c, "status")) : "";
  if (!["in", "maybe", "out"].includes(status)) return redirectNote(c, "err");
  const events = eventsGet(c);
  const mtype = await typeOf(c, uid);
  for (const e of events) {
    if (eid(e) === id) {
      if (!canRsvp(e.type, mtype)) return new DieReply("Not eligible to RSVP for this event.");
      const pairs = rsvpEmpty(e) ? [] : rsvpsOf(e);
      const hit = pairs.find(([u]) => u === uid);
      if (hit) hit[1] = status; else pairs.push([uid, status]);
      e.rsvps = pairs;
    }
  }
  await eventsSave(c, events);
  return redirectNote(c, "rsvpset");
}

/* ---- renderers ---- */
export async function scheduleMemberHtml(c: Ctx, uid: number): Promise<string> {
  const up = eventsUpcoming(c);
  if (!up.length) return "";
  const mtype = await typeOf(c, uid);
  let o = '<div class="fppm-card"><h3>Upcoming schedule</h3>';
  for (const e of up) {
    const id = eid(e);
    const mine = rsvpsOf(e).find(([u]) => u === uid)?.[1] ?? "";
    o += '<div style="border-bottom:1px solid var(--fppm-line);padding:.6em 0;">';
    o += "<strong>" + esc(eventLabel(e)) + '</strong> <span class="fppm-badge">' + esc(hasKey(EVENT_TYPES, e.type) ? EVENT_TYPES[str(e.type)] : "") + "</span>";
    o += '<div class="fppm-muted">' + esc(eventWhen(c, e)) + (truthy(e.location) ? " · " + esc(e.location) : "") + "</div>";
    o += calendarHtml(c, e);
    if (truthy(e.notes)) o += '<div class="fppm-muted" style="font-size:.85rem;">' + esc(e.notes) + "</div>";
    if (canRsvp(e.type, mtype)) {
      o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '" style="margin-top:.4em;display:flex;gap:.4rem;flex-wrap:wrap;">';
      o += '<input type="hidden" name="action" value="fppm_rsvp"><input type="hidden" name="id" value="' + id + '">';
      o += nonceField(c, "fppm_rsvp_" + id);
      for (const [st, lab] of [["in", "I'm in"], ["maybe", "Maybe"], ["out", "Can't"]]) {
        const on = mine === st ? "background:var(--fppm-purple);color:#fff;border-color:var(--fppm-purple);" : "";
        o += '<button class="fppm-btn fppm-btn--ghost" style="padding:.3em .8em;font-size:.85rem;' + on + '" name="status" value="' + st + '">' + esc(lab) + "</button>";
      }
      o += "</form>";
    }
    o += "</div>";
  }
  return o + "</div>";
}

export async function scheduleStaffHtml(c: Ctx): Promise<string> {
  let o = '<div class="fppm-card"><h3>Schedule</h3>';
  o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '" style="margin-bottom:1rem;">';
  o += '<input type="hidden" name="action" value="fppm_add_event">';
  o += nonceField(c, "fppm_add_event");
  o += '<div class="fppm-row"><div class="fppm-field" style="flex:0 1 160px;"><label>Type</label><select name="etype">';
  for (const [k, v] of Object.entries(EVENT_TYPES)) o += '<option value="' + esc(k) + '">' + esc(v) + "</option>";
  o += '</select></div><div class="fppm-field"><label>Opponent / title</label><input type="text" name="etitle" placeholder="e.g. Miami United"></div></div>';
  o += '<div class="fppm-row">';
  o += '<div class="fppm-field" style="flex:0 1 150px;"><label>Repeats</label><select name="erecur"><option value="none">One-time</option><option value="weekly">Every week</option></select></div>';
  o += '<div class="fppm-field" style="flex:0 1 150px;"><label>Weekly day</label><select name="eweekday">';
  WEEKDAYS.forEach((wn, wi) => { o += '<option value="' + wi + '" ' + selected(wi, 6) + ">" + esc(wn) + "</option>"; });
  o += "</select></div>";
  o += '<div class="fppm-field" style="flex:0 1 160px;"><label>Date (one-time)</label><input type="date" name="edate"></div>';
  o += "</div>";
  o += '<div class="fppm-row"><div class="fppm-field" style="flex:0 1 120px;"><label>Start</label><input type="time" name="etime"></div><div class="fppm-field" style="flex:0 1 120px;"><label>End</label><input type="time" name="eend"></div><div class="fppm-field"><label>Location</label><input type="text" name="eloc" placeholder="e.g. Dan McCarty Track"></div></div>';
  o += '<div class="fppm-field"><label>Coordinates (lat, lng) — optional, drops a map pin when there is no address</label><input type="text" name="ecoords" placeholder="27.4312, -80.3369"></div>';
  o += '<div class="fppm-field"><label>Notes</label><input type="text" name="enotes"></div>';
  o += '<button class="fppm-btn" type="submit">Add event</button></form>';
  const up = eventsUpcoming(c);
  if (!up.length) o += '<p class="fppm-muted">No upcoming events yet.</p>';
  for (const e of up) {
    const id = eid(e);
    const cnt = rsvpCounts(e);
    o += '<div style="border-bottom:1px solid var(--fppm-line);padding:.6em 0;">';
    o += "<strong>" + esc(eventLabel(e)) + '</strong> <span class="fppm-muted">' + esc(eventWhen(c, e)) + (truthy(e.location) ? " · " + esc(e.location) : "") + "</span>";
    o += '<div style="margin:.3em 0;"><span class="fppm-badge fppm-badge--paid">' + cnt.in + ' in</span> <span class="fppm-badge fppm-badge--gold">' + cnt.maybe + ' maybe</span> <span class="fppm-badge">' + cnt.out + " out</span></div>";
    if (!rsvpEmpty(e)) {
      o += '<details class="fppm-det"><summary>who responded</summary><div style="font-size:.85rem;margin-top:.3em;">';
      for (const [ruid, st] of rsvpsOf(e)) o += esc(await displayName(c, ruid)) + " — " + esc(st) + "<br>";
      o += "</div></details>";
    }
    o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + "\" onsubmit=\"return confirm('Delete this event?');\" style=\"margin-top:.3em;\">";
    o += '<input type="hidden" name="action" value="fppm_delete_event"><input type="hidden" name="id" value="' + id + '">';
    o += nonceField(c, "fppm_delevent_" + id);
    o += '<button class="fppm-btn fppm-btn--ghost" style="padding:.2em .7em;font-size:.8rem;" type="submit">Delete</button></form>';
    o += "</div>";
  }
  return o + "</div>";
}

export function nextEventPublicHtml(c: Ctx): string {
  const e = eventNext(c);
  if (!e) return "";
  return '<div style="margin-top:.9rem;background:rgba(255,255,255,.14);border-radius:10px;padding:.6rem .8rem;font-size:.92rem;"><strong style="color:var(--fppm-gold);font-family:\'Oswald\',sans-serif;">Next up:</strong> '
    + esc(eventLabel(e)) + " · " + esc(eventWhen(c, e)) + (truthy(e.location) ? " · " + esc(e.location) : "") + "</div>";
}
