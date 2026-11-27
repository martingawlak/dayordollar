/**
 * Section 11: the installable app — the manifest (/?fppm_pwa=manifest), the
 * service worker (/?fppm_pwa=sw), the head tags and the footer's "Install
 * app" pill. Same addresses and bytes as the plugin served.
 */
import { type Ctx, homeUrl } from "../ctx";
import { esc, escUrl, phpJson } from "../php";
import { sanitizeKey } from "../wpfn";
import { assetUrl, FPPM_VER, str, teamName } from "./core";
import { escJs } from "./store";
import { FPPM_PWA_FOOTER, FPPM_PWA_SERVE } from "./templates.gen";

export const pwaStartUrl = (c: Ctx) => homeUrl(c, "/account/");
export const pwaManifestUrl = (c: Ctx) => homeUrl(c, "/?fppm_pwa=manifest");
export const pwaSwUrl = (c: Ctx) => homeUrl(c, "/?fppm_pwa=sw");
export const THEME_COLOR = "#5E17EB";
const NOCACHE = { "Cache-Control": "no-cache, must-revalidate, max-age=0, no-store, private", Expires: "Wed, 11 Jan 1984 05:00:00 GMT" };

export function manifestJson(c: Ctx): string {
  return phpJson({
    name: teamName(c), short_name: "Purple Martins", description: "Roster, dues, apparel and updates for the " + teamName(c) + ".", id: "/", start_url: pwaStartUrl(c),
    scope: homeUrl(c, "/"), display: "standalone", orientation: "portrait", background_color: "#111111", theme_color: THEME_COLOR,
    icons: [
      { src: assetUrl(c, "icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: assetUrl(c, "icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: assetUrl(c, "icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
export const swJs = (c: Ctx) => "/* FPPM service worker */\nconst FPPM_CACHE = 'fppm-v" + FPPM_VER + "';\nconst FPPM_START = '" + escJs(pwaStartUrl(c)) + "';\n" + FPPM_PWA_SERVE[0];

/** fppm_pwa_serve(): the manifest or the service worker for ?fppm_pwa=, else null (the page goes on). */
export function pwaServe(c: Ctx, raw: unknown): Response | null {
  if (!raw) return null;
  const what = sanitizeKey(str(raw));
  if (what === "manifest") return new Response(manifestJson(c), { headers: { ...NOCACHE, "Content-Type": "application/manifest+json; charset=utf-8" } });
  if (what === "sw") return new Response(swJs(c), { headers: { ...NOCACHE, "Content-Type": "application/javascript; charset=utf-8", "Service-Worker-Allowed": "/" } });
  return null;
}
/** fppm_pwa_head() (wp_head, priority 5). */
export function pwaHead(c: Ctx): string {
  return "\n<!-- FPPM PWA -->\n"
    + '<link rel="manifest" href="' + escUrl(pwaManifestUrl(c)) + '">' + "\n"
    + '<meta name="theme-color" content="' + esc(THEME_COLOR) + '">' + "\n"
    + '<meta name="apple-mobile-web-app-capable" content="yes">' + "\n"
    + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' + "\n"
    + '<meta name="apple-mobile-web-app-title" content="Purple Martins">' + "\n"
    + '<link rel="apple-touch-icon" href="' + escUrl(assetUrl(c, "apple-touch-180.png")) + '">' + "\n"
    + '<link rel="icon" type="image/png" sizes="32x32" href="' + escUrl(assetUrl(c, "favicon-32.png")) + '">' + "\n";
}
/** fppm_pwa_footer() (wp_footer): registers the service worker and adds the install pill. */
export function pwaFooter(c: Ctx): string {
  const T = FPPM_PWA_FOOTER;
  return T[0] + escUrl(assetUrl(c, "icon-192.png")) + T[1] + escUrl(pwaSwUrl(c)) + T[2];
}
