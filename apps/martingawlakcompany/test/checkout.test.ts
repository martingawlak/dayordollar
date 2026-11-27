/**
 * /api/checkout against a fake Stripe (no network): without
 * STRIPE_SHARED_CUSTOMER the request Stripe gets is exactly today's; with it,
 * a signed-in buyer checks out as their shared Customer, and if the key can't
 * reach Customers the checkout still goes through by email.
 *
 * Run (from this folder): npx tsx test/checkout.test.ts
 */
import { SignJWT } from "jose";
import { onRequestPost } from "../functions/api/checkout";
import products from "../src/data/products.json";

let failed = 0;
const ok = (cond: unknown, what: string) => { if (cond) console.log("✓ " + what); else { failed++; console.log("✗ " + what); } };

const seen: { path: string; body: URLSearchParams }[] = [];
let customersAllowed = true;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (u.origin !== "https://api.stripe.com") throw new Error("no network in tests: " + u);
  const body = new URLSearchParams(init?.method === "POST" ? String(init.body) : u.search);
  seen.push({ path: u.pathname, body });
  const j = (status: number, v: unknown) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  if (u.pathname.startsWith("/v1/customers")) {
    if (!customersAllowed) return j(403, { error: { message: "The provided key does not have the required permissions" } });
    return u.pathname === "/v1/customers/search" ? j(200, { data: [{ id: "cus_shared" }] }) : j(200, { id: "cus_new" });
  }
  if (u.pathname === "/v1/checkout/sessions") return j(200, { id: "cs_1", url: "https://checkout.stripe.test/1" });
  return j(404, { error: { message: "no fake" } });
}) as typeof fetch;

const SECRET = "test-session-secret-test-session-secret";
const cookie = "__Host-mgc_session=" + await new SignJWT({ user: { id: "acct-ann", email: "ann@example.com", name: "Ann" } })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const product = products.find((p: any) => p.active)!;
const run = async (env: Record<string, string>, signedIn: boolean) => {
  seen.length = 0;
  const form = new FormData(); form.set("slug", product.slug); form.set("quantity", "1");
  const request = new Request("https://martingawlakcompany.com/api/checkout", { method: "POST", body: form, headers: signedIn ? { cookie } : {} });
  const res = await (onRequestPost as any)({ request, env: { STRIPE_SECRET_KEY: "sk_test", SESSION_SECRET: SECRET, SSO_ISSUER: "", SSO_CLIENT_ID: "", SSO_CLIENT_SECRET: "", ...env } });
  return { res, paths: seen.map((s) => s.path), session: seen.find((s) => s.path === "/v1/checkout/sessions")?.body };
};

{
  const a = await run({}, true);
  ok(a.res.status === 303 && a.paths.join() === "/v1/checkout/sessions", "flag off: one call, to Checkout Sessions only (the restricted key's one permission)");
  ok(a.session!.get("customer_email") === "ann@example.com" && a.session!.get("client_reference_id") === "acct-ann" && !a.session!.has("customer") && !a.session!.has("saved_payment_method_options[payment_method_save]") && !a.session!.has("metadata[mgc_account]"), "flag off: today's parameters, by email");
  const g = await run({ STRIPE_SHARED_CUSTOMER: "1" }, false);
  ok(g.paths.join() === "/v1/checkout/sessions" && !g.session!.has("customer") && !g.session!.has("customer_email"), "flag on, guest: as today");
  const b = await run({ STRIPE_SHARED_CUSTOMER: "1" }, true);
  ok(b.res.status === 303 && b.session!.get("customer") === "cus_shared" && !b.session!.has("customer_email"), "flag on, signed in: the shared Customer");
  ok(b.session!.get("saved_payment_method_options[payment_method_save]") === "enabled" && b.session!.get("metadata[mgc_account]") === "acct-ann" && b.session!.get("metadata[site]") === "martingawlakcompany.com", "flag on: saved cards, and the metadata the other sites' order lists read");
  customersAllowed = false;
  const c = await run({ STRIPE_SHARED_CUSTOMER: "1" }, true);
  customersAllowed = true;
  ok(c.res.status === 303 && c.session!.get("customer_email") === "ann@example.com" && !c.session!.has("customer"), "flag on but the key can't reach Customers: checks out by email, as today");
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
