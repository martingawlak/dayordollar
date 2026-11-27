/**
 * The shop against a fake Stripe (no network): the deck's Checkout Session,
 * the Customer another site already made being reused, the guest path, the
 * webhook's signature, recording an order once (no automatic fulfilment
 * here: "needs fulfilment"), "Your orders", and the shop's pages.
 *
 * Run: npx tsx test/shop.test.ts
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { here, testEnv } from "./harness";
import { makeCtx } from "../src/ctx";
import { checkout, webhook, yourOrders, type ShopCtx, type ShopSite } from "../src/shop/shop";
import { customerForAccount, verifyWebhook } from "../src/shop/stripe";
import { shopSite, SITE } from "../src/shop/gff";
import { PRODUCTS } from "../src/shop/catalog.gen";
import { pageResponse } from "../src/routes/page";

let failed = 0;
const ok = (cond: unknown, what: string) => { if (cond) console.log("✓ " + what); else { failed++; console.log("✗ " + what); } };

/* ---- The fake Stripe; Ann's Customer already exists (made by dayordollar.com) ---- */
const calls: { method: string; path: string; body: URLSearchParams; headers: Record<string, string | string[] | undefined> }[] = [];
const customers = [{ id: "cus_dod_ann", email: "ann@example.com", metadata: { mgc_account: "acct-ann" } }];
let stripeDown = false;
const sessions: any[] = [];
const server = createServer(async (req, res) => {
  let raw = ""; for await (const ch of req) raw += ch;
  const url = new URL(req.url!, "http://x");
  const body = new URLSearchParams(req.method === "GET" ? url.search : raw);
  calls.push({ method: req.method!, path: url.pathname, body, headers: req.headers });
  const send = (status: number, j: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
  if (stripeDown) return send(500, { error: { message: "down" } });
  if (req.headers.authorization !== "Bearer sk_test_shop") return send(401, { error: { message: "bad key" } });
  if (url.pathname === "/v1/customers/search") {
    const m = /metadata\['mgc_account'\]:'([^']*)'/.exec(body.get("query") ?? "");
    return send(200, { data: customers.filter((c) => c.metadata.mgc_account === m?.[1]) });
  }
  if (url.pathname === "/v1/customers" && req.method === "POST") {
    const c = { id: "cus_" + (customers.length + 1), email: body.get("email") ?? "", metadata: { mgc_account: body.get("metadata[mgc_account]") ?? "" } };
    customers.push(c);
    return send(200, c);
  }
  if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
    const s = { id: "cs_test_" + (sessions.length + 1), url: "https://checkout.stripe.test/" + (sessions.length + 1), params: body };
    sessions.push(s);
    return send(200, { id: s.id, url: s.url });
  }
  if (url.pathname === "/v1/checkout/sessions" && req.method === "GET") {
    return send(200, { data: [{ id: "cs_done_1", created: 1795000000, amount_total: 6000, currency: "usd", metadata: { site: SITE }, line_items: { data: [{ description: "Legacy Starter Deck" }] } },
      { id: "cs_done_2", created: 1794000000, amount_total: 10000, currency: "usd", metadata: { site: "dayordollar.com" }, line_items: { data: [{ description: "DayorDollar Shirt" }] } }] });
  }
  send(404, { error: { message: "no fake for " + url.pathname } });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  let u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  u = u.replace("https://api.stripe.com", base);
  if (!u.startsWith(base)) return Promise.reject(new Error("no network in tests: " + u));
  return realFetch(u, init);
}) as typeof fetch;

/* ---- The site: the app's schema, two people with shared accounts ---- */
const db = new DatabaseSync(":memory:");
for (const f of readdirSync(here("../migrations")).sort()) db.exec(readFileSync(here("../migrations/" + f), "utf8"));
db.exec(`insert into wp_users (id, login, email, display_name, roles, account_id) values (2, 'ann', 'ann@example.com', 'Ann', '["subscriber"]', 'acct-ann'), (3, 'bo', 'bo@example.com', 'Bo', '["subscriber"]', 'acct-bo');
  insert into wp_options (option_name, option_value) values ('admin_email', 'owner@example.com');`);
const env = testEnv(db, { STRIPE_SECRET_KEY: "sk_test_shop", STRIPE_WEBHOOK_SECRET: "whsec_test" });
const NOW = 1795176000;
const site = async (uid: number) => { const c = await makeCtx(env, uid, "/shop/", NOW); return { c: c as unknown as ShopCtx, s: shopSite(c) }; };
const lastSession = () => sessions[sessions.length - 1].params as URLSearchParams;
const deck = PRODUCTS[0];
ok(PRODUCTS.length === 1 && deck.price === 6000 && deck.shipping && !deck.variations.length, "the catalogue: the Legacy Starter Deck, $60, shipped");

/* ---- Checkout ---- */
{
  const { c, s } = await site(2);
  const r = await checkout(c, s, { product: deck.slug, quantity: "3", unit_amount: "1" });
  ok(r.status === 303 && r.headers.get("location") === "https://checkout.stripe.test/1", "signed in: Buy now redirects to Stripe Checkout");
  const p = lastSession();
  ok(p.get("customer") === "cus_dod_ann" && customers.length === 1, "the Customer dayordollar.com made is reused (one customer across the sites)");
  ok(p.get("line_items[0][price_data][unit_amount]") === "6000" && p.get("line_items[0][quantity]") === "3", "the price comes from the catalogue, never the form");
  ok(p.get("saved_payment_method_options[payment_method_save]") === "enabled" && p.get("shipping_address_collection[allowed_countries][0]") === "US" && p.get("customer_update[shipping]") === "auto", "saved cards, US shipping kept on the Customer");
  ok(p.get("metadata[site]") === SITE && p.get("metadata[sku]") === String(deck.id) && p.get("metadata[product]") === String(deck.id) && p.get("metadata[mgc_account]") === "acct-ann", "metadata: site, sku, product, account");
  ok(p.get("success_url") === "https://gawlakfamilyfarms.com/shop/thanks/?session_id={CHECKOUT_SESSION_ID}" && p.get("cancel_url") === `https://gawlakfamilyfarms.com/product/${deck.slug}/`, "return addresses");
  const b = await site(3);
  await checkout(b.c, b.s, { product: deck.slug });
  ok(lastSession().get("customer") === "cus_2" && customers.length === 2, "someone new gets a Customer of their own, tagged with their account");
  const g = await site(0);
  await checkout(g.c, g.s, { product: deck.slug });
  const q = lastSession();
  ok(!q.has("customer") && !q.has("customer_email") && !q.has("metadata[mgc_account]") && q.get("line_items[0][quantity]") === "1", "guest: no Customer, Stripe asks for the email");
  ok((await checkout(g.c, g.s, { product: "nope" })).status === 404, "an unknown product is refused");
  ok((await customerForAccount(env, "acct-ann", "ann@example.com")) === "cus_dod_ann", "the shared lookup finds the same Customer again");
}
/* ---- The webhook ---- */
const sign = async (payload: string, t = NOW, secret = "whsec_test") => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${sig}`;
};
const event = (id: string, sessionId: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  id, type: "checkout.session.completed",
  data: { object: { id: sessionId, payment_status: "paid", customer: "cus_dod_ann", amount_total: 6000, currency: "usd", customer_details: { email: "ann@example.com", name: "Ann" },
    shipping_details: { name: "Ann A", address: { line1: "1 Main St", city: "Fort Pierce", state: "FL", postal_code: "34982", country: "US" } },
    metadata: { site: SITE, sku: String(deck.id), product: String(deck.id), variation: "", quantity: "1", mgc_account: "acct-ann" }, ...extra } },
});
{
  const { c, s } = await site(0);
  const mails: string[][] = [];
  const s2: ShopSite = { ...s, sendMail: async (to, subject, body) => { mails.push([to, subject, body]); return true; } };
  ok(!(await verifyWebhook("whsec_test", "{}", await sign("{}", NOW - 301), NOW)) && !(await verifyWebhook("whsec_test", "{}", await sign("{}", NOW, "whsec_other"), NOW)), "old or wrongly signed: refused");
  const ev = event("evt_1", "cs_paid_1");
  ok((await webhook(c, s2, ev, "t=1,v1=00")).status === 400, "the webhook refuses a bad signature");
  const r1: any = await (await webhook(c, s2, ev, await sign(ev))).json();
  const row: any = db.prepare("select * from shop_orders where stripe_session = 'cs_paid_1'").get();
  ok(r1.recorded === row.id && row.status === "needs_fulfilment" && row.account_id === "acct-ann" && /Fort Pierce/.test(row.shipping), "a paid session is recorded, to be shipped by hand");
  ok(mails.length === 2 && mails[0][0] === "ann@example.com" && /Fort Pierce/.test(mails[0][2]) && mails[1][0] === "owner@example.com" && /needs_fulfilment/.test(mails[1][2]), "the buyer's receipt and the admin's notice are sent");
  const r2: any = await (await webhook(c, s2, ev, await sign(ev))).json();
  ok(r2.duplicate === row.id && (db.prepare("select count(*) n from shop_orders").get() as any).n === 1 && mails.length === 2, "the same event again records nothing and sends nothing");
  const ev4 = event("evt_4", "cs_other", { metadata: { site: "dayordollar.com" } });
  ok(((await (await webhook(c, s2, ev4, await sign(ev4))).json()) as any).ignored === "another site", "another site's session is left to that site");
}
/* ---- Your orders ---- */
{
  const { c, s } = await site(2);
  const a = await yourOrders(c, s);
  ok(a.from === "stripe" && a.lines.length === 2 && a.lines[1].site === "dayordollar.com", "your orders: every site's, from Stripe");
  stripeDown = true;
  const b = await yourOrders(c, s);
  stripeDown = false;
  ok(b.from === "site" && b.lines.length === 1 && b.lines[0].site === SITE, "Stripe down: this site's own records");
}
/* ---- The pages ---- */
{
  const calls0 = calls.length;
  const get = async (path: string) => pageResponse(env, new Request("https://gawlakfamilyfarms.com" + path));
  const shop = await get("/shop/");
  const html = await shop.text();
  ok(shop.status === 200 && html.includes(`/product/${deck.slug}/`) && html.includes("<title>Shop - Gawlak Family Farms</title>") && !html.includes("__MODULE_"), "/shop/ lists the deck in the site's frame");
  const prod = await (await get(`/product/${deck.slug}/`)).text();
  ok(prod.includes('action="/shop/checkout"') && prod.includes(">Buy now</button>") && prod.includes("60.00") && !prod.includes("add-to-cart"), "the product page: price and Buy now");
  ok((await get("/product/nope/")).status === 404 && (await get("/account/")).status === 200, "unknown products are 404; the other pages are untouched");
  const orders = await (await get("/account/orders/")).text();
  ok(orders.includes("Sign in to see your orders"), "/account/orders/ signed out: asks to sign in");
  ok(calls.length === calls0, "rendering the shop made no Stripe calls");
}
server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
