/** Orders kept on this device so tickets open offline at the door, even with no signal. */
const KEY = "deaddreams.orders";

export interface SavedOrder {
  id: string;
  code: string;
  status: string;
  quantity: number;
  totalCents: number;
  name: string;
  event: { slug: string; title: string; startsAt: string; doorsAt: string | null; venue: string; address: string; cancelled: boolean };
  tickets: { code: string; seq: number; status: string; checkedInAt: number | null }[];
  [k: string]: unknown;
}

export function loadOrders(): SavedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveOrder(o: SavedOrder) {
  try {
    const list = loadOrders().filter((x) => x.id !== o.id);
    list.unshift(o);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

export function forgetOrder(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadOrders().filter((x) => x.id !== id)));
  } catch {}
}
