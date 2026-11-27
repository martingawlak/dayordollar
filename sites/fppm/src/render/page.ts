/**
 * fppm.us's pages in the theme's frame (Twenty Twenty-Five, cut by
 * scripts/gen-shell.py), as WordPress answered them:
 *
 *   'init'              ?fppm_pwa= (manifest, service worker) and ?fppm_ics= on any address;
 *                       the standing Saturday conditioning is seeded once
 *   template_redirect   the login gate (1), the completion gate (2), a posted join form (10)
 *   the page            its content, shortcodes run in order, then the template-level
 *                       filters (wptexturize, convert_smilies, wp_filter_content_tags)
 */
import type { Env } from "../env";
import { type Ctx, makeCtx } from "../ctx";
import type { AjaxCtx } from "../ajax";
import { currentUserId, sameOrigin } from "../session";
import { SHELLS } from "./shell.gen";
import { templateFilters } from "./texturize";
import { pwaFooter, pwaHead, pwaServe } from "../fppm/pwa";
import { icsServe, seedEvents } from "../fppm/events";
import { completionGate, loginGate, type PageInfo } from "../fppm/gate";
import { maybeHandleRegister, scRegister } from "../fppm/register";
import { scAccount, scMerch } from "../fppm/account";

interface PageDef extends PageInfo { shell: string }
/** The site's published pages (post_name, and the shortcodes in post_content). */
export const PAGES: Record<string, PageDef> = {
  "/": { slug: "fort-pierce-purple-martins", shortcodes: ["fppm_register", "fppm_merch"], shell: "home" },
  "/go/": { slug: "go", shortcodes: ["fppm_register"], shell: "go" },
  "/account/": { slug: "account", shortcodes: ["fppm_account"], shell: "account" },
  "/roster/": { slug: "roster", shortcodes: [], shell: "roster" },
};

const SHORTCODES: Record<string, (c: Ctx) => Promise<string>> = {
  fppm_register: (c) => scRegister(c),
  fppm_invite: (c) => scRegister(c, { default: "fan" }),
  fppm_account: (c) => scAccount(c),
  fppm_merch: (c) => scMerch(c),
};

/** The page's HTML: the frame with the plugin's output in its places. */
export async function renderPage(c: Ctx, shellKey: string): Promise<string> {
  let html = SHELLS[shellKey];
  if (c.origin !== "https://fppm.us") html = html.split("https://fppm.us").join(c.origin);
  const parts = html.split(/__SC_(fppm_[a-z_]+)__/);
  let out = "";
  for (let i = 0; i < parts.length; i++) out += i % 2 ? templateFilters(await SHORTCODES[parts[i]](c), c.origin) : parts[i];
  return out.replace("__LOGGED_IN__", c.uid ? " logged-in" : "").replace("__FPPM_HEAD__", pwaHead(c)).replace("__FPPM_FOOTER__", pwaFooter(c));
}

const HTML = { "content-type": "text/html; charset=UTF-8", "cache-control": "private, no-store" };

export async function pageResponse(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const uid = await currentUserId(env, req);
  const c = await makeCtx(env, uid, url.pathname + url.search);
  c.get = Object.fromEntries(url.searchParams);
  // 'init': the plugin's own endpoints answer on any address.
  const pwa = pwaServe(c, c.get.fppm_pwa);
  if (pwa) return pwa;
  if (c.get.fppm_ics) return icsServe(c, String(c.get.fppm_ics));
  await seedEvents(c);

  const path = url.pathname;
  const slashed = path.endsWith("/") ? path : path + "/";
  const page = PAGES[slashed] ?? null;
  if (page && slashed !== path) return Response.redirect(new URL(slashed + url.search, url).toString(), 301);

  // template_redirect: the gates, then a posted join form.
  const gate = loginGate(c, page) ?? (await completionGate(c, page));
  if (gate) return new Response(null, { status: 302, headers: { location: gate, "cache-control": "no-store" } });
  if (req.method === "POST" && page) {
    if (!sameOrigin(req)) return new Response("Reload the page and try again.", { status: 403 });
    const form = await req.formData().catch(() => new FormData());
    const post: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") post[k] = v;
    const ac = Object.assign(c, { post, ip: req.headers.get("cf-connecting-ip") ?? "", ua: req.headers.get("user-agent") ?? "", files: {} }) as AjaxCtx;
    const r = await maybeHandleRegister(ac);
    if (r) return r.toResponse();
  }
  if (!page) return new Response(await renderPage(c, "notfound"), { status: 404, headers: HTML });
  return new Response(await renderPage(c, page.shell), { headers: HTML });
}
