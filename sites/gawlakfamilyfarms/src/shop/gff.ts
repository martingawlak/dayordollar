/**
 * gawlakfamilyfarms.com's shop: the carried-over WooCommerce product (the
 * Legacy Starter Deck), Stripe Checkout with the shared Customer, and no
 * automatic fulfilment: every paid order is recorded as "needs fulfilment"
 * and the admin's email says so (the deck ships by hand, as it did on Woo).
 */
import type { Env } from "../env";
import { type Ctx, makeCtx, opt } from "../ctx";
import { currentUserId, sameOrigin } from "../session";
import { sendMail } from "../wp";
import { PRODUCTS } from "./catalog.gen";
import { checkout, type ShopCtx, type ShopSite, webhook, yourOrders } from "./shop";
import { ordersTable, productPage, shopGrid, thanksPage } from "./pages";
import { findProduct } from "./catalog";

export const SITE = "gawlakfamilyfarms.com";

export function shopSite(c: Ctx): ShopSite {
  return {
    site: SITE, products: PRODUCTS, adminEmail: String(opt(c, "admin_email", "") || ""),
    sendMail: (to, subject, body) => sendMail(c.env, to, subject, body),
  };
}
const asShop = (c: Ctx): ShopCtx => c as unknown as ShopCtx;

/**
 * The live site's WooCommerce stylesheets don't come along (the shop is four
 * small pages), so the few rules the markup needs, in the theme's own terms.
 */
const SHOP_CSS = "<style>.woocommerce ul.products{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2em}"
  + ".woocommerce ul.products li img,.woocommerce-product-gallery img{width:100%;height:auto;display:block}"
  + ".woocommerce-loop-product__title{font-size:1.1em;margin:.6em 0 .2em}.woocommerce .price{display:block;margin-bottom:.8em}"
  + ".woocommerce div.product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2em}.woocommerce div.product .woocommerce-tabs{grid-column:1/-1}"
  + "@media(max-width:768px){.woocommerce div.product{grid-template-columns:1fr}}"
  + ".woocommerce .quantity{display:inline-block;margin-right:.5em}.woocommerce .qty{width:4em}.shop-fine{font-size:.85em;opacity:.75;margin-top:.8em}"
  + ".woocommerce-orders-table{width:100%;border-collapse:collapse}.woocommerce-orders-table th,.woocommerce-orders-table td{text-align:left;padding:.5em;border-bottom:1px solid #ddd}</style>";

/** Page bodies for the site's page frame (routes/page.ts): /shop/, /product/<slug>/, /shop/thanks/, /account/orders/. */
export async function shopContent(c: Ctx, path: string): Promise<string | null> {
  if (path === "/shop/") return SHOP_CSS + shopGrid(PRODUCTS, c.origin);
  if (path === "/shop/thanks/") return SHOP_CSS + thanksPage(SITE);
  const m = /^\/product\/([^/]+)\/$/.exec(path);
  if (m) { const p = findProduct(PRODUCTS, m[1]); return p ? SHOP_CSS + productPage(p) : null; }
  if (path === "/account/orders/") {
    if (!c.uid) return '<div class="woocommerce"><div class="woocommerce-info">Sign in to see your orders. <a class="button" href="/account/">Sign in</a></div></div>';
    return SHOP_CSS + '<div class="woocommerce"><h1>Your orders</h1></div>' + ordersTable((await yourOrders(asShop(c), shopSite(c))).lines, c.origin + "/shop/");
  }
  return null;
}
/** The page's title (before " - Gawlak Family Farms"), or null when the path is not a shop page. */
export function shopTitle(path: string): string | null {
  if (path === "/shop/") return "Shop";
  if (path === "/shop/thanks/") return "Thank you";
  if (path === "/account/orders/") return "Your orders";
  const m = /^\/product\/([^/]+)\/$/.exec(path);
  return m ? findProduct(PRODUCTS, m[1])?.name ?? null : null;
}

/** POST /shop/checkout and POST /shop/stripe-webhook. */
export async function shopPost(env: Env, req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname.replace(/\/?$/, "/");
  if (path === "/shop/checkout/") {
    if (!sameOrigin(req)) return new Response("Reload the page and try again.", { status: 403 });
    const form: Record<string, string> = {};
    for (const [k, v] of (await req.formData().catch(() => new FormData())).entries()) if (typeof v === "string") form[k] = v;
    const c = await makeCtx(env, await currentUserId(env, req), "/shop/");
    return checkout(asShop(c), shopSite(c), form);
  }
  if (path === "/shop/stripe-webhook/") {
    const c = await makeCtx(env, 0, "/shop/");
    return webhook(asShop(c), shopSite(c), await req.text(), req.headers.get("stripe-signature"));
  }
  return null;
}
