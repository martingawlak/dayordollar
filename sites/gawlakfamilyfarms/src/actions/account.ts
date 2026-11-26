/**
 * The account page's AJAX: gff_planner_autosave (the customer's planner saves
 * itself as it changes) and gff_crop_toggle (staff tick a crop as planted on a
 * client's card). Ported line for line; checked by the actions bench.
 */
import { type AjaxCtx, error, p, type Reply, success } from "../ajax";
import { type Ctx, meta, setMeta } from "../ctx";
import { phpInt } from "../php";
import { sanitizeTextField } from "../wpfn";
import { currentMysql, currentTs } from "../wpcore";
import { gmdate, phpJson } from "../php";
import { offers } from "../forms/catalog";
import { isArr, notEmpty, parseLayout } from "../forms/express";
import { mysql2date } from "../render/account";

/** gff_can_manage_clients(): staff (gff_view_clients) or administrators (manage_options). */
export const canManageClients = (c: Ctx) => !!c.user && (c.user.roles.includes("gff_staff") || c.user.roles.includes("administrator"));

/** wp_ajax_gff_planner_autosave: never overwrites a saved garden with an empty one. */
export async function plannerAutosave(c: AjaxCtx): Promise<Reply> {
  if (!c.uid) return error({ msg: "auth" }, 403);
  const uid = c.uid;
  const parsed = parseLayout(c.post.gff_farm_layout !== undefined ? c.post.gff_farm_layout : "");
  if (!parsed || !parsed.flat.length) return error({ msg: "empty" });
  await setMeta(c, uid, "gff_farm_layout", phpJson(parsed.layout));
  await setMeta(c, uid, "gff_crops_wanted", parsed.flat);
  await setMeta(c, uid, "gff_moringa_fruit_upgrade", parsed.moringa_upgrade ? "yes" : "no");
  const chosen = parsed.layout.offer !== undefined ? parsed.layout.offer : "";
  if (offers().includes(chosen)) await setMeta(c, uid, "gff_offer", chosen);
  return success({ saved: gmdate("H:i", currentTs(c)) });
}

/** wp_ajax_gff_crop_toggle: mark a client's crop planted (with the date) or not. */
export async function cropToggle(c: AjaxCtx): Promise<Reply> {
  const uid = c.post.uid !== undefined ? phpInt(p(c, "uid")) : 0;
  const crop = c.post.crop !== undefined ? sanitizeTextField(p(c, "crop")) : "";
  const on = c.post.on !== undefined && p(c, "on") === "1";
  if (!canManageClients(c)) return error({ msg: "not allowed" }, 403);
  if (!uid || crop === "") return error({ msg: "missing data" }, 400);
  const pl = await meta(c, uid, "gff_crops_planted");
  const planted: Record<string, any> = isArr(pl) ? Object.assign({}, pl) : {};
  if (on) planted[crop] = currentMysql(c); else delete planted[crop];
  await setMeta(c, uid, "gff_crops_planted", Object.keys(planted).length ? planted : []);
  const cr = await meta(c, uid, "gff_crops_wanted");
  const crops: unknown[] = Array.isArray(cr) ? cr : isArr(cr) ? Object.values(cr) : [];
  let done = 0;
  for (const cc of crops) if (notEmpty(planted[String(cc)])) done++;
  return success({ done, total: crops.length, when: on ? mysql2date("M j", planted[crop]) : "" });
}
