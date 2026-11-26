/**
 * The site's three pages inside the theme's frame (Astra + Beaver Builder,
 * cut from the live site by scripts/gen-shell.py), with the layout modules
 * that hold the plugin's shortcodes filled from the layout's own text.
 *
 * Tracking, as the live site had it: Site Kit's Google tags for signed-out
 * visitors only; the WPCode "GA4 User-ID" snippet for signed-in customers
 * (not staff); the Meta pixel for everyone (base code; PixelYourSite's
 * server-side half needs WordPress).
 */
import type { Env } from "../env";
import { type Ctx, makeCtx } from "../ctx";
import type { AjaxCtx } from "../ajax";
import { currentUserId, sameOrigin } from "../session";
import { doShortcodes } from "../render/shortcodes";
import { wpautop } from "../wpautop";
import { footerAssets, headAssets } from "../render/assets";
import { registerAssets } from "../render/home";
import { maybeHandleSubmit } from "../forms/express";
import * as S from "../render/shell.gen";

interface PageDef { title: string; head: string; body: string }
const PAGES: Record<string, PageDef> = {
  "/": { title: "Gawlak Family Farms - Gawlak Family Farms", head: S.HOME_HEAD, body: S.HOME_BODY },
  "/account/": { title: "Account - Gawlak Family Farms", head: S.ACCOUNT_HEAD, body: S.ACCOUNT_BODY },
  "/garden/": { title: "Garden - Gawlak Family Farms", head: S.GARDEN_HEAD, body: S.GARDEN_BODY },
};

/** Staff = can edit posts (administrator, editor, author, contributor). */
const isStaff = (c: Ctx) => !!c.user?.roles.some((r) => ["administrator", "editor", "author", "contributor", "shop_manager"].includes(r));

const META_PIXEL = "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','408144794862479');fbq('track','PageView');</script>"
  + '<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=408144794862479&ev=PageView&noscript=1" /></noscript>';

function tracking(c: Ctx): { head: string; body: string } {
  if (!c.uid) return { head: S.SITEKIT_HEAD, body: S.SITEKIT_BODY };
  if (isStaff(c)) return { head: "", body: "" };
  return {
    head: '<script async src="https://www.googletagmanager.com/gtag/js?id=G-0HF639XRY2"></script>'
      + '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("set","user_properties",{login_state:"logged_in"});gtag("config","G-0HF639XRY2",{user_id:"' + c.uid + '"});</script>',
    body: "",
  };
}

/**
 * A layout module's content as Beaver Builder printed it: rich text through
 * wpautop() first (Beaver Builder does not unwrap shortcode paragraphs, so a
 * shortcode keeps its <p>), then the shortcodes; an HTML module's code
 * through the shortcodes only.
 */
async function moduleHtml(c: Ctx, node: string): Promise<string> {
  const text = S.MODULE_TEXT[node] ?? "";
  const autop = S.MODULE_TYPE[node] === "rich-text" ? wpautop(text) : text;
  return doShortcodes(c, autop);
}

export async function renderPage(c: Ctx, def: PageDef): Promise<string> {
  registerAssets(c);
  // Fill the holes in page order: the modular form shortcodes share state (the form opens in one module and closes in a later one).
  let body = "";
  let last = 0;
  for (const m of def.body.matchAll(/__MODULE_([a-z0-9]+)__/g)) {
    body += def.body.slice(last, m.index) + (await moduleHtml(c, m[1]));
    last = m.index! + m[0].length;
  }
  body += def.body.slice(last);
  const t = tracking(c);
  const head = def.head.replace("__TITLE__", def.title).replace("__SITEKIT_HEAD__", t.head) + headAssets(c) + "</head>";
  const footer = [...c.footer].sort((a, b) => a.prio - b.prio);
  let foot = footerAssets(c);
  for (const f of footer) foot += await f.run();
  body = body.replace("__SITEKIT_BODY__", t.body).replace("</body>", foot + META_PIXEL + "</body>");
  return head + body + "</html>";
}

export async function pageResponse(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  const def = PAGES[path];
  if (!def) return new Response("Not found", { status: 404 });
  if (path !== url.pathname) return Response.redirect(new URL(path + url.search, url).toString(), 301);
  const uid = await currentUserId(env, req);
  const c = await makeCtx(env, uid, path);
  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("Reload the page and try again.", { status: 403 });
    const form = await req.formData().catch(() => new FormData());
    const post: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") post[k] = v;
    const ac = Object.assign(c, { post, get: Object.fromEntries(url.searchParams), ip: req.headers.get("cf-connecting-ip") ?? "0", files: {} }) as AjaxCtx;
    await maybeHandleSubmit(ac);
  }
  return new Response(await renderPage(c, def), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "private, no-store" } });
}
