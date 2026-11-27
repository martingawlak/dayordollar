/**
 * The outside world both sides talk to, faked: PayPal (OAuth token, create
 * and capture orders), Printful (orders, stores, products) and Google (the
 * service-account token exchange, which checks the JWT's signature with the
 * public half of a key made for this run, and the Sheets calls). Each side
 * gets its own fake with its own log; the logs must come out identical
 * (method, address, Authorization, body).
 */
import { createVerify, generateKeyPairSync } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Handler } from "./harness";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const SA_PEM = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
export const SA_JSON = JSON.stringify({ type: "service_account", client_email: "waivers@fppm-test.iam.gserviceaccount.com", private_key: SA_PEM });

const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function fakeWorld(): { handle: Handler; log: unknown[] } {
  const log: unknown[] = [];
  let orders = 0;
  const sheets: Record<string, string[]> = { "sheet-new": [], "sheet-has-tab": ["Sheet1", "Waivers"], "sheet-locked": ["Waivers"], "sheet-addfails": [] };
  const appended: Record<string, unknown[]> = {};
  const handle: Handler = (url, body, req: IncomingMessage) => {
    const auth = String(req.headers.authorization ?? "");
    log.push([req.method, url, auth, body, req.headers["x-pf-store-id"] ?? ""]);
    const q = new URL(url, "http://x");
    const p = q.pathname;
    /* PayPal */
    if (p === "/paypal/v1/oauth2/token") {
      if (auth !== "Basic " + Buffer.from("test-client-id:test-pp-secret").toString("base64")) return { __status: 401, __body: JSON.stringify({ error: "invalid_client" }) };
      return { access_token: "PP-ACCESS", token_type: "Bearer", expires_in: 32400 };
    }
    if (p === "/paypal/v2/checkout/orders") {
      if (auth !== "Bearer PP-ACCESS") return { __status: 401, __body: "{}" };
      const b = JSON.parse(body);
      if (b.purchase_units?.[0]?.amount?.value === "13.37") return { __status: 422, __body: JSON.stringify({ name: "UNPROCESSABLE_ENTITY" }) };
      return { id: "PPORDER" + ++orders, status: "CREATED" };
    }
    const cap = /^\/paypal\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(p);
    if (cap) return decodeURIComponent(cap[1]).includes("2") ? { id: cap[1], status: "PAYER_ACTION_REQUIRED" } : { id: cap[1], status: "COMPLETED" };
    /* Printful */
    if (p === "/printful/orders") {
      const b = JSON.parse(body);
      if (b.recipient?.zip === "00000") return { __status: 400, __body: JSON.stringify({ code: 400, error: { message: "Recipient: invalid ZIP" } }) };
      return { code: 200, result: { id: 9000 + b.items[0].sync_variant_id % 100, status: "draft" } };
    }
    if (p === "/printful/stores") return auth === "Bearer many-stores" ? { result: [{ id: 1, name: "A" }, { id: 2, name: "B" }] } : { result: [{ id: 18455537, name: "FPPM" }] };
    if (p === "/printful/store/products") {
      if (auth === "Bearer bad-token") return { __status: 401, __body: JSON.stringify({ error: { message: "Malformed token" } }) };
      if (q.searchParams.get("offset") !== "0") return { result: [] };
      return { result: [{ id: 11, name: "FPPM Official Tee", thumbnail_url: "https://files.example.test/list-tee.png" }, { id: 12, name: "Cap" }, { id: 13, name: "Empty" }] };
    }
    if (p === "/printful/store/products/11") return { result: { sync_product: { name: "FPPM Official Tee", thumbnail_url: "https://files.example.test/tee.png" }, sync_variants: [
      { id: 501, name: "FPPM Official Tee - M", retail_price: "25.00", files: [{ type: "default" }, { type: "preview", preview_url: "https://files.example.test/tee-m.png" }] },
      { id: 502, name: "FPPM Official Tee / XL", retail_price: "27.50", product: { image: "https://files.example.test/tee-xl.png" } },
      { id: 503, name: "Other name", retail_price: "25" }, { id: 0, name: "no id", retail_price: "1" }] } };
    if (p === "/printful/store/products/12") return { result: { sync_product: { name: "Cap" }, sync_variants: [{ id: 601, name: "Cap", retail_price: "19.999" }] } };
    if (p === "/printful/store/products/13") return { result: { sync_product: { name: "Empty" }, sync_variants: [] } };
    /* Google */
    if (p === "/google-oauth/token") {
      const assertion = new URLSearchParams(body).get("assertion") ?? "";
      const [h, c, s] = assertion.split(".");
      const ok = h && c && s && createVerify("RSA-SHA256").update(h + "." + c).verify(keys.publicKey, b64urlDecode(s));
      if (!ok) return { __status: 400, __body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }) };
      return { access_token: "G-ACCESS", expires_in: 3599, token_type: "Bearer" };
    }
    const sh = /^\/sheets\/v4\/spreadsheets\/([^/:?]+)(.*)$/.exec(p);
    if (sh) {
      const id = decodeURIComponent(sh[1]), rest = sh[2];
      if (auth !== "Bearer G-ACCESS") return { __status: 401, __body: "{}" };
      if (!(id in sheets)) return { __status: 404, __body: JSON.stringify({ error: { code: 404, message: "Requested entity was not found." } }) };
      if (rest === "" && req.method === "GET") return { sheets: sheets[id].map((title) => ({ properties: { title } })) };
      if (rest === ":batchUpdate") {
        if (id === "sheet-addfails") return { __status: 400, __body: JSON.stringify({ error: { message: "Invalid requests" } }) };
        sheets[id].push(JSON.parse(body).requests[0].addSheet.properties.title);
        return { replies: [{}] };
      }
      if (rest.endsWith(":append")) {
        if (id === "sheet-locked" || id === "sheet-addfails") return { __status: 403, __body: JSON.stringify({ error: { code: 403, message: "The caller does not have permission" } }) };
        (appended[id] ??= []).push(...JSON.parse(body).values);
        return { updates: { updatedRows: JSON.parse(body).values.length } };
      }
    }
    return undefined;
  };
  return { handle, log };
}
