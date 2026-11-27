/**
 * admin-ajax.php for the Worker: the plugin's AJAX actions by their own
 * names, answering in wp_send_json_* shape with the same HTTP status.
 *
 * WordPress picked wp_ajax_{action} for signed-in visitors and
 * wp_ajax_nopriv_{action} for everyone else; an action with no handler for
 * the visitor answered a bare "0". The nonce checks (check_ajax_referer)
 * become one same-origin check on every POST (session.ts).
 */
import type { Ctx } from "./ctx";

/** $_POST / $_GET: strings, or lists for fields named like x[]. */
export type Post = Record<string, string | string[]>;

export interface AjaxCtx extends Ctx {
  post: Post;
  get: Post;
  /** $_SERVER['REMOTE_ADDR']. */
  ip: string;
  /** $_SERVER['HTTP_USER_AGENT']. */
  ua?: string;
  /** Uploaded files by field name ($_FILES). */
  files: Record<string, File>;
  /** Run work after the reply (waitUntil); tests run it at once. */
  later?: (fn: () => Promise<unknown>) => void;
}

/** wp_send_json_*: { success, data } — no data key when there is none, as WordPress. */
export class Reply {
  constructor(public body: unknown, public status = 200) {}
  toResponse(): Response {
    if (typeof this.body === "string") return new Response(this.body, { status: this.status, headers: { "content-type": "text/html; charset=UTF-8" } });
    return Response.json(this.body, { status: this.status });
  }
}
export const success = (data?: unknown, status?: number) =>
  new Reply({ success: true, ...(data !== undefined && data !== null ? { data } : {}) }, status ?? 200);
export const error = (data?: unknown, status?: number) =>
  new Reply({ success: false, ...(data !== undefined && data !== null ? { data } : {}) }, status ?? 200);
/** wp_die( '' ) after a handler printed nothing / admin-ajax's "0" for an unknown action. */
export const die = (text = "") => new Reply(text);

export type Handler = (c: AjaxCtx) => Promise<Reply>;
export interface Action { priv?: Handler; nopriv?: Handler }

/** $_POST[ key ] as a string ('' when absent; PHP reads a list as "Array"). */
export const p = (c: AjaxCtx, key: string): string => { const v = c.post[key]; return v === undefined ? "" : Array.isArray(v) ? "Array" : v; };
/** $_POST[ key ] when it is a list (is_array), else null. */
export const pa = (c: AjaxCtx, key: string): string[] | null => { const v = c.post[key]; return Array.isArray(v) ? v : null; };
export const has = (c: AjaxCtx, key: string) => Object.prototype.hasOwnProperty.call(c.post, key);
