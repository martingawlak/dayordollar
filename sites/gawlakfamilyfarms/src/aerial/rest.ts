/**
 * The plugin's REST API at its own paths (AT_Rest), with WordPress's REST
 * behaviour for it: argument checks, then the permission check, then the
 * callback; errors in WordPress's {code, message, data:{status}} shape.
 *
 *   GET  /wp-json/aerial-timelapse/v1/property[?user_id=N]   own (or, for staff, a customer's) timelapse
 *   POST /wp-json/aerial-timelapse/v1/property {address}     build own timelapse
 *   GET|POST /wp-json/aerial-timelapse/v1/check-updates      full sweep: token (X-AT-Token or ?token=) or an admin
 *
 * WordPress's cookie auth wanted the X-WP-Nonce header (atConfig.nonce); the
 * Worker trusts its session cookie on GET and on a same-origin POST instead,
 * as for admin-ajax.php (MIGRATION.md). Application passwords are not offered.
 */
import type { Env } from "../env";
import { type Ctx, makeCtx, meta } from "../ctx";
import { phpJson } from "../php";
import { sanitizeTextField } from "../wpfn";
import { currentUserId, sameOrigin } from "../session";
import { can } from "../admin/core";
import { buildProperty } from "./fetcher";
import { isAtError } from "./naip";
import { run, verifyToken } from "./checker";
import { getProperty, isGlowing, type Property } from "./property";

export interface RestReply { status: number; data: unknown }
const err = (code: string, message: string, data: Record<string, unknown>): RestReply => ({ status: Number(data.status), data: { code, message, data } });

function payload(c: Ctx, p: Property | null): Record<string, unknown> {
  if (!p) return { has_property: false };
  const frames: any[] = Array.isArray(p.frames) ? p.frames : Object.values(p.frames ?? {});
  return {
    has_property: true,
    address: p.address,
    frames: frames.map((f) => ({ url: f.url, date: f.date })),
    is_new_update: isGlowing(c, p),
    new_update_expiry: p.new_update_expiry,
    last_updated_at: p.last_updated_at,
    source: "USDA NAIP (public domain)",
  };
}
/** The WooCommerce billing address, to prefill the form. */
async function billingAddress(c: Ctx, uid: number): Promise<string> {
  const t = async (k: string) => String((await meta(c, uid, k)) ?? "").trim();
  const street = await t("billing_address_1"), city = await t("billing_city");
  if (street === "" || city === "") return "";
  const state = await t("billing_state"), zip = await t("billing_postcode");
  return `${street}, ${city}, ${state} ${zip}`.replace(/^[, ]+|[, ]+$/g, "");
}
/** is_numeric() and a whole number: WordPress's integer argument check. */
const isInteger = (v: string) => /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(v) && Math.round(Number(v)) === Number(v);
/** absint() of a numeric string */
const absint = (v: string) => Math.abs(Math.trunc(Number(v)));

/**
 * One REST request: method, route (after /wp-json), its parameters (query and
 * body together, as WP_REST_Request merges them) and headers.
 */
export async function restDispatch(c: Ctx, method: string, route: string, params: Record<string, string>, headers: Record<string, string>): Promise<RestReply> {
  const signedIn = c.uid > 0;
  const forbidden = () => err("rest_forbidden", "Sorry, you are not allowed to do that.", { status: signedIn ? 403 : 401 });
  if (route === "/aerial-timelapse/v1/property" && method === "GET") {
    if (params.user_id !== undefined && !isInteger(params.user_id)) {
      const msg = "user_id is not of type integer.";
      return err("rest_invalid_param", "Invalid parameter(s): user_id", { status: 400, params: { user_id: msg }, details: { user_id: { code: "rest_invalid_type", message: msg, data: { param: "user_id" } } } });
    }
    if (!signedIn) return forbidden();
    const asked = params.user_id !== undefined ? absint(params.user_id) : 0;
    const uid = asked || c.uid;
    if (c.uid !== uid && !can(c, "edit_users")) return { status: 403, data: { error: "Not allowed." } };
    const out = payload(c, await getProperty(c, uid));
    if (!out.has_property) out.suggested_address = await billingAddress(c, uid);
    return { status: 200, data: out };
  }
  if (route === "/aerial-timelapse/v1/property" && method === "POST") {
    if (params.address === undefined) return err("rest_missing_callback_param", "Missing parameter(s): address", { status: 400, params: ["address"] });
    if (!signedIn) return forbidden();
    const p = await buildProperty(c, c.uid, sanitizeTextField(params.address));
    if (isAtError(p)) return { status: 400, data: { error: p.message } };
    return { status: 201, data: payload(c, p) };
  }
  if (route === "/aerial-timelapse/v1/check-updates" && (method === "GET" || method === "POST")) {
    let t = Object.entries(headers).find(([h]) => h.toLowerCase() === "x-at-token")?.[1] ?? "";
    if (!t) t = params.token ?? "";
    if (!((t && verifyToken(c, t)) || can(c, "manage_options"))) return forbidden();
    const r = await run(c);
    return { status: 200, data: { checked: r.checked, updated: r.updated, errors: r.errors } };
  }
  return err("rest_no_route", "No route was found matching the URL and request method.", { status: 404 });
}

/** The Worker's /wp-json/aerial-timelapse/v1/* route; null for anything else. */
export async function restRoute(env: Env, req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const prefix = "/wp-json";
  if (!url.pathname.startsWith(prefix + "/aerial-timelapse/")) return null;
  const params: Record<string, string> = Object.fromEntries(url.searchParams);
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      try { for (const [k, v] of Object.entries((await req.json()) as Record<string, unknown>)) params[k] = typeof v === "string" ? v : JSON.stringify(v); } catch { /* an unreadable body reads as no parameters */ }
    } else {
      const form = await req.formData().catch(() => new FormData());
      for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
    }
  }
  let uid = await currentUserId(env, req);
  if (req.method === "POST" && !sameOrigin(req)) uid = 0; // a cross-site POST is a visitor's, as WordPress without the nonce
  const ctx = await makeCtx(env, uid, url.pathname);
  const r = await restDispatch(ctx, req.method === "HEAD" ? "GET" : req.method, url.pathname.slice(prefix.length), params, Object.fromEntries(req.headers));
  return new Response(phpJson(r.data), { status: r.status, headers: { "content-type": "application/json; charset=UTF-8" } });
}
