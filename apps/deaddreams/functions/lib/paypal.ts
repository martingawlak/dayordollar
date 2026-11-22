import type { Env } from "../env.ts";
import type { OrderRow } from "./db.ts";
import { showDate } from "./util.ts";

/**
 * PayPal Checkout (Orders v2). The buyer approves in PayPal's popup (with a PayPal
 * account, or as a guest with a debit/credit card); nothing is charged until
 * capturePayment runs here on the server, which then issues the tickets.
 */
const base = (env: Env) =>
  env.PAYPAL_API_BASE || (env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");

let cached: { token: string; until: number; key: string } | null = null;

async function token(env: Env): Promise<string> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal is not configured");
  const key = `${base(env)}|${env.PAYPAL_CLIENT_ID}`;
  if (cached && cached.key === key && cached.until > Date.now()) return cached.token;
  const res = await fetch(`${base(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`PayPal auth: ${data.error_description ?? res.status}`);
  cached = { token: data.access_token, until: Date.now() + ((data.expires_in ?? 300) - 60) * 1000, key };
  return data.access_token;
}

async function call<T>(env: Env, path: string, body?: unknown, requestId?: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${base(env)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${await token(env)}`,
      "content-type": "application/json",
      ...(requestId ? { "paypal-request-id": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

const usd = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });

/** Create the PayPal order for one of our orders; returns PayPal's order id for the buttons. */
export async function createPaypalOrder(env: Env, order: OrderRow, event: { title: string; starts_at: string }): Promise<string> {
  const items = [
    {
      name: `Ticket · ${event.title}`.slice(0, 127),
      description: `${showDate(event.starts_at)} · digital ticket`.slice(0, 127),
      quantity: String(order.quantity),
      unit_amount: usd(order.unit_cents),
      category: "DIGITAL_GOODS",
    },
  ];
  if (order.tip_cents > 0)
    items.push({ name: "Another dollar · tip for the artists", description: "", quantity: "1", unit_amount: usd(order.tip_cents), category: "DIGITAL_GOODS" });

  const { ok, data } = await call<{ id?: string; message?: string }>(
    env,
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.id,
          invoice_id: order.code,
          description: `${order.code} · ${event.title}`.slice(0, 127),
          amount: { ...usd(order.total_cents), breakdown: { item_total: usd(order.total_cents) } },
          items,
        },
      ],
      application_context: { brand_name: "Dead Dreams Booking", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
    },
    `create-${order.id}`,
  );
  if (!ok || !data.id) throw new Error(`PayPal create order: ${data.message ?? "failed"}`);
  return data.id;
}

interface PaypalOrder {
  id: string;
  status: string;
  purchase_units?: { custom_id?: string; payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
  details?: { issue: string }[];
}

/**
 * Capture (charge) an approved PayPal order. Returns true only when PayPal says the
 * money for exactly this order and amount has been captured. Safe to repeat.
 */
export async function capturePayment(env: Env, order: OrderRow, paypalOrderId: string): Promise<boolean> {
  const id = encodeURIComponent(paypalOrderId);
  let res = await call<PaypalOrder>(env, `/v2/checkout/orders/${id}/capture`, {}, `capture-${order.id}`);
  if (!res.ok && res.data.details?.some((d) => d.issue === "ORDER_ALREADY_CAPTURED")) res = await call<PaypalOrder>(env, `/v2/checkout/orders/${id}`);
  if (!res.ok) {
    console.error("PayPal capture failed", res.status, JSON.stringify(res.data).slice(0, 500));
    return false;
  }
  const unit = res.data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return (
    res.data.status === "COMPLETED" &&
    unit?.custom_id === order.id &&
    capture?.status === "COMPLETED" &&
    capture.amount.currency_code === "USD" &&
    Math.round(Number(capture.amount.value) * 100) === order.total_cents
  );
}
