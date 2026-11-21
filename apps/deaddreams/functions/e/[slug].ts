import { SITE } from "../../src/config.ts";
import type { Env } from "../env.ts";
import { eventBySlug, publicEvent } from "../lib/db.ts";
import { showDate } from "../lib/util.ts";

/**
 * GET /e/:slug  the direct ticket link. Serves the ticket page with the show
 * baked in, so the link previews properly on Facebook and the page opens instantly.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const shell = await env.ASSETS.fetch(new URL("/event/", request.url));
  const e = await eventBySlug(env.DB, String(params.slug));
  if (!e || e.status === "draft") {
    return new HTMLRewriter()
      .on("title", { element: (el) => void el.setInnerContent(`Show not found | ${SITE.name}`) })
      .transform(new Response(shell.body, { status: 404, headers: shell.headers }));
  }
  const ev = publicEvent(e);
  const url = new URL(`/e/${e.slug}`, request.url).toString();
  const title = `${e.title} · ${showDate(e.starts_at)}`;
  const price = ev.priceCents ? `$${(ev.priceCents / 100).toFixed(2)}` : "Free";
  const state = ev.onSale ? "Tickets on sale now" : ev.cancelled ? "Cancelled" : "Sold out";
  const desc = [e.venue, price, state].filter(Boolean).join(" · ");
  const image = new URL(e.image_url || "/icons/icon-512.png", request.url).toString();
  const data = JSON.stringify(ev).replace(/</g, "\\u003c");

  const set = (attr: string, value: string) => ({ element: (el: Element) => void el.setAttribute(attr, value) });
  return new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(`${title} | ${SITE.name}`) })
    .on('meta[name="description"]', set("content", desc))
    .on('meta[property="og:title"]', set("content", title))
    .on('meta[property="og:description"]', set("content", desc))
    .on('meta[property="og:url"]', set("content", url))
    .on('meta[property="og:image"]', set("content", image))
    .on('link[rel="canonical"]', set("href", url))
    .on("head", {
      element: (el) => void el.append(`<script id="event-data" type="application/json">${data}</script>`, { html: true }),
    })
    .transform(
      new Response(shell.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
    );
};
