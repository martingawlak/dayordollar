export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const money = (cents: number) => "$" + (cents / 100).toFixed(2);

function wallDate(wall: string) {
  const [d, t = "00:00"] = wall.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, day, h, min));
}
const fmt = (wall: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(wallDate(wall));

/** Event times are wall-clock strings in the venue's zone, shown exactly as entered. */
export const showDate = (wall: string) => fmt(wall, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
export const showTime = (wall: string) => fmt(wall, { hour: "numeric", minute: "2-digit" });
export const showMonth = (wall: string) => fmt(wall, { month: "short" });
export const showDay = (wall: string) => fmt(wall, { day: "numeric" });

export const mapLink = (q: string) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status, data });
  return data as T;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function copyText(btn: HTMLButtonElement, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    const t = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = t), 1200);
  } catch {}
}
