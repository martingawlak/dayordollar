/**
 * Printing what the request enqueued, the way WordPress printed it: styles
 * and their inline additions in the head, scripts (localized data first,
 * inline additions after) in the footer.
 */
import type { Ctx } from "../ctx";
import { esc } from "../php";

const withVer = (src: string, ver: string | false | null) => (ver === null ? src : src + (src.includes("?") ? "&" : "?") + "ver=" + encodeURIComponent(ver === false ? "6.9" : ver));

export function headAssets(c: Ctx): string {
  let out = "";
  for (const [h, s] of Object.entries(c.assets.styles)) {
    if (s.src) out += `<link rel='stylesheet' id='${esc(h)}-css' href='${esc(withVer(s.src, s.ver))}' media='all' />\n`;
    const inl = c.assets.inline_styles[h];
    if (inl?.length) out += `<style id="${esc(h)}-inline-css">\n${inl.join("\n")}\n</style>\n`;
  }
  return out;
}

export function footerAssets(c: Ctx): string {
  let out = "";
  for (const [h, s] of Object.entries(c.assets.scripts)) {
    const loc = c.assets.localized[h];
    if (loc) out += `<script id="${esc(h)}-js-extra">\n` + Object.entries(loc).map(([name, data]) => `var ${name} = ${JSON.stringify(data).replace(/\//g, "\\/")};`).join("\n") + "\n</script>\n";
    if (s.src) out += `<script src="${esc(withVer(s.src, s.ver))}" id="${esc(h)}-js"></script>\n`;
    const inl = c.assets.inline_scripts[h];
    if (inl?.length) out += `<script id="${esc(h)}-js-after">\n${inl.join("\n")}\n</script>\n`;
  }
  return out;
}
