/** Every request handler the plugin registered, by its own name: AJAX (admin-ajax.php) and admin-post.php. */
import type { Action } from "../ajax";

/** Registered as wp_ajax_ and wp_ajax_nopriv_. */
export const both = (h: Action["priv"]): Action => ({ priv: h, nopriv: h });
/** Registered as wp_ajax_ only: signed-out visitors get admin-ajax's bare "0". */
export const priv = (h: Action["priv"]): Action => ({ priv: h });

/** wp_ajax_* / wp_ajax_nopriv_* (gff_crop_toggle, gff_planner_autosave, gff_v34_consent: not ported yet). */
export const ACTIONS: Record<string, Action> = {};

/** admin_post_* / admin_post_nopriv_* (the client admin's forms: not ported yet). */
export const POSTS: Record<string, Action> = {};
