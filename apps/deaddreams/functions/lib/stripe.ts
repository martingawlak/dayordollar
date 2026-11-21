import type { Env } from "../env.ts";
import type { OrderRow } from "./db.ts";
import { showDate } from "./util.ts";

interface Session {
  id: string;
  url?: string;
  payment_status?: string;
  status?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

async function stripe(env: Env, path: string, body?: URLSearchParams): Promise<Session> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const data = (await res.json()) as Session & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

export function createCheckout(
  env: Env,
  origin: string,
  order: OrderRow,
  event: { slug: string; title: string; starts_at: string; image_url: string },
  email: string,
) {
  const p = new URLSearchParams({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: email,
    success_url: `${origin}/order/?id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/e/${event.slug}?cancelled=${order.id}`,
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    "metadata[order_id]": order.id,
    "metadata[order_code]": order.code,
    "metadata[site]": "deaddreamsbooking.com",
    "payment_intent_data[metadata][order_id]": order.id,
    "payment_intent_data[description]": `${order.code} · ${event.title}`,
    "line_items[0][quantity]": String(order.quantity),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(order.unit_cents),
    "line_items[0][price_data][product_data][name]": `Ticket · ${event.title}`,
    "line_items[0][price_data][product_data][description]": `${showDate(event.starts_at)} · digital ticket`,
  });
  if (event.image_url.startsWith("https://")) p.set("line_items[0][price_data][product_data][images][0]", event.image_url);
  if (order.tip_cents > 0) {
    p.set("line_items[1][quantity]", "1");
    p.set("line_items[1][price_data][currency]", "usd");
    p.set("line_items[1][price_data][unit_amount]", String(order.tip_cents));
    p.set("line_items[1][price_data][product_data][name]", "Another dollar · tip for the artists");
  }
  return stripe(env, "checkout/sessions", p);
}

export const getCheckout = (env: Env, id: string) => stripe(env, `checkout/sessions/${encodeURIComponent(id)}`);

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Verify a Stripe webhook's Stripe-Signature header (v1, HMAC-SHA256, 5 minute tolerance). */
export async function verifyWebhook(secret: string, payload: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((kv) => kv.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
