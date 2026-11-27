/**
 * The shared account panel (MGC brand bubbles, Inbox, Connections, Settings),
 * the same on every brand site. The panel's code and the Inbox itself live in
 * the accounts service (apps/accounts in martingawlak/dayordollar); this site
 * only places it on its account page and relays its calls, vouching for the
 * signed-in member through a private service binding (never the internet).
 *
 * The same file is in each site: sites/gawlakfamilyfarms, sites/fppm,
 * bandturo-appearances/app and dod-zora/app. Keep them alike.
 */

/** The accounts Worker's "Members" entrypoint ([[services]] ACCOUNTS in wrangler.toml). */
export interface AccountsBinding {
  fetch(req: Request): Promise<Response>;
}

export const PANEL_SRC = "https://accounts.martingawlakcompany.com/panel.js";

/** The panel's place on the page; it stays empty for anyone not signed in. */
export function panelHtml(site: string, opts: { api?: string; signout?: string } = {}): string {
  return `<div id="mgc-account" data-site="${site}" data-api="${opts.api ?? "/account/api"}" data-signout="${opts.signout ?? "/auth/logout"}"></div>`
    + `<script src="${PANEL_SRC}" defer></script>`;
}

/** What the panel in a browser may ask for. The site-only operations (links, link) never pass. */
const PANEL_OPS = new Set(["summary", "counts", "connections", "thread", "send", "answer", "settings"]);

const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * GET/POST /account/api/<op> → the shared Inbox, as the member whose sign-in
 * id (`sub` from the accounts service) is `account`.
 */
export async function inboxProxy(binding: AccountsBinding | undefined, req: Request, site: string, account: string | null): Promise<Response> {
  const url = new URL(req.url);
  const op = url.pathname.match(/\/account\/api\/([a-z]+)$/)?.[1];
  if (!op || !PANEL_OPS.has(op)) return json(404, "Not found");
  if (!binding) return json(503, "Messages aren't switched on here yet.");
  if (!account) return json(401, "Sign in again.");
  if (req.method !== "GET" && req.method !== "POST") return json(405, "Method not allowed");
  if (req.method === "POST" && req.headers.get("origin") !== url.origin) return json(403, "Reload the page and try again.");
  const headers = new Headers({ "x-mgc-account": account, "x-mgc-site": site, accept: "application/json" });
  if (req.method === "POST") headers.set("content-type", "application/json");
  const res = await binding.fetch(
    new Request(`https://accounts/inbox/${op}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "POST" ? await req.text() : undefined,
    }),
  );
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Unread messages for a badge in the site's own menu (null when unknown). Never throws. */
export async function inboxUnread(binding: AccountsBinding | undefined, site: string, account: string | null): Promise<number | null> {
  if (!binding || !account) return null;
  try {
    const res = await binding.fetch(new Request("https://accounts/inbox/counts", { headers: { "x-mgc-account": account, "x-mgc-site": site } }));
    return res.ok ? (((await res.json()) as { unread?: number }).unread ?? 0) : null;
  } catch {
    return null;
  }
}
