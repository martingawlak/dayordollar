import { SITE } from "../../src/config.ts";

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export const fail = (error: string, status = 400) => json({ error }, status);

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

export function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

export const newId = () => crypto.randomUUID().replace(/-/g, "");

/** Wall-clock "YYYY-MM-DDTHH:MM" right now in the site's time zone. */
export function wallNow(date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SITE.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const today = () => wallNow().slice(0, 10);

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Human date for emails and share text, from a wall-clock string. */
export function showDate(wall: string): string {
  const [d, t] = wall.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = (t ?? "00:00").split(":").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day, h, min));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
