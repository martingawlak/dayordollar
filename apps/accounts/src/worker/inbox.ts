/**
 * The shared Inbox: messages and connections between members, the same on
 * every brand site (design approved by Martin, 2026-11-27).
 *
 * - Connected members write to each other freely.
 * - A first message to someone new arrives as a request. The writer can't send
 *   more until it is answered. The other person can Accept (connected on every
 *   site), Ignore or Block; the writer is never told which.
 * - People are found by their email address, which is never shown to anyone.
 * - At most 3 new people a day (rolling 24 hours), and at most 10 "no member
 *   with that email" answers a day, so addresses can't be guessed in bulk.
 * - New-message notice by email: one when new messages arrive, then none until
 *   the person opens their Inbox; at most 60 a day across all members, so
 *   sign-in codes always fit in Resend's 100-a-day free plan.
 */
import { brands } from "@mgc/brands";

/** The part of D1 used here (also implemented over node:sqlite in the tests). */
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown>;
}
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export const NEW_PEOPLE_PER_DAY = 3;
export const LOOKUP_MISSES_PER_DAY = 10;
export const NOTICES_PER_DAY = 60;
export const MAX_BODY = 4000;
const DAY = 24 * 60 * 60 * 1000;

/** A notice email, handed to the mailer by the caller. */
export interface Notice {
  to: string;
  toName: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  html: string;
  text: string;
}

export interface InboxDeps {
  db: Db;
  now?: () => number;
  /** Sends a notice; errors are logged, never shown to the writer. */
  notify?: (n: Notice) => Promise<void>;
}

export class InboxError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
}
interface ConnRow {
  user_a: string;
  user_b: string;
  status: "pending" | "accepted" | "ignored" | "blocked" | "removed";
  requested_by: string;
  blocked_by: string | null;
  created: number;
  updated: number;
}

export interface Person {
  id: string;
  name: string;
  image: string | null;
}

/**
 * What the other person's connection means to me:
 *  connected | request_in (they wrote first, I haven't answered) |
 *  waiting (I wrote first, no answer yet, or they ignored/blocked me) |
 *  ignored (I ignored them) | blocked (I blocked them) | none
 */
export type Relation = "connected" | "request_in" | "waiting" | "ignored" | "blocked" | "none";

function relation(c: ConnRow | null, me: string): Relation {
  if (!c || c.status === "removed") return "none";
  if (c.status === "accepted") return "connected";
  if (c.status === "blocked") return c.blocked_by === me ? "blocked" : "waiting";
  if (c.status === "ignored") return c.requested_by === me ? "waiting" : "ignored";
  return c.requested_by === me ? "waiting" : "request_in";
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const displayName = (u: { name: string | null }) => (u.name ?? "").trim() || "Member";
const person = (u: UserRow): Person => ({ id: u.id, name: displayName(u), image: u.image });

/** Which brand a site id is, and how its notices are sent. */
export function siteBrand(site: string) {
  const b = brands.find((x) => x.id === site) ?? brands[0];
  const origin = new URL(b.url).origin;
  const sender: Record<string, [string, string]> = {
    mgc: ["Martin Gawlak Company", "hello"],
    gff: ["Gawlak Family Farms", "hello"],
    bandturo: ["Bandturo", "bandturo"],
    dayordollar: ["DayorDollar", "dayordollar"],
    fppm: ["Fort Pierce Purple Martins", "fppm"],
  };
  const [fromName, local] = sender[b.id] ?? sender.mgc;
  return { id: b.id, name: b.name, fromName, fromAddress: `${local}@martingawlakcompany.com`, inboxUrl: `${origin}/account/#inbox` };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function noticeEmail(to: UserRow, from: Person, site: string, isRequest: boolean): Notice {
  const b = siteBrand(site);
  const first = displayName(to).split(/\s+/)[0];
  const what = isRequest ? "a message request" : "a message";
  const html = `<div style="font-family:Lato,system-ui,sans-serif;max-width:30rem;color:#232323;line-height:1.45">
<p>Hi ${esc(first)},</p>
<p><b>${esc(from.name)}</b> sent you ${what} on ${esc(b.name)}.</p>
<p><a href="${b.inboxUrl}" style="display:inline-block;background:#c9a227;color:#232323;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:11px 22px;border-radius:999px">Open your Inbox</a></p>
<p style="color:#777;font-size:13px">You get one email when new messages arrive. No more until you've opened your Inbox, however many come in.</p>
<p style="color:#777;font-size:13px">Turn these emails off in your account, under Settings.</p>
</div>`;
  const text = `Hi ${first},\n\n${from.name} sent you ${what} on ${b.name}.\n\nOpen your Inbox: ${b.inboxUrl}\n\nYou get one email when new messages arrive. No more until you've opened your Inbox, however many come in.\nTurn these emails off in your account, under Settings.`;
  return { to: to.email, toName: displayName(to), fromName: b.fromName, fromAddress: b.fromAddress, subject: `${from.name} sent you a message`, html, text };
}

export class Inbox {
  private now: () => number;
  constructor(private deps: InboxDeps) {
    this.now = deps.now ?? Date.now;
  }
  private get db() {
    return this.deps.db;
  }

  private async user(id: string): Promise<UserRow | null> {
    return this.db.prepare(`select id, name, email, image from "user" where id = ? and coalesce(banned, 0) = 0`).bind(id).first<UserRow>();
  }
  private async me(id: string): Promise<UserRow> {
    const u = await this.user(id);
    if (!u) throw new InboxError("Sign in again.", 401);
    return u;
  }
  private conn(x: string, y: string): Promise<ConnRow | null> {
    const [a, b] = pair(x, y);
    return this.db.prepare(`select * from member_connection where user_a = ? and user_b = ?`).bind(a, b).first<ConnRow>();
  }
  private setConn(x: string, y: string, status: ConnRow["status"], requestedBy: string, blockedBy: string | null = null) {
    const [a, b] = pair(x, y);
    const t = this.now();
    return this.db
      .prepare(
        `insert into member_connection (user_a, user_b, status, requested_by, blocked_by, created, updated) values (?, ?, ?, ?, ?, ?, ?)
         on conflict (user_a, user_b) do update set status = excluded.status, requested_by = excluded.requested_by, blocked_by = excluded.blocked_by, updated = excluded.updated`,
      )
      .bind(a, b, status, requestedBy, blockedBy, t, t);
  }
  private inboxRow(id: string) {
    return this.db.prepare(`insert into member_inbox (user_id) values (?) on conflict (user_id) do nothing`).bind(id);
  }

  /** Inbox list. Opening it also re-arms the email notice. */
  async summary(meId: string) {
    const me = await this.me(meId);
    const t = this.now();
    await this.db.batch([this.inboxRow(meId), this.db.prepare(`update member_inbox set opened_at = ? where user_id = ?`).bind(t, meId)]);
    const settings = await this.db.prepare(`select notify from member_inbox where user_id = ?`).bind(meId).first<{ notify: number }>();
    // One query for the whole list (D1 caps queries per request: 1,000 measured, 50 in the docs).
    const rows = (
      await this.db
        .prepare(
          `with mine as (
             select id, case when from_user = ?1 then to_user else from_user end as partner, to_user, read_at
             from member_message where from_user = ?1 or to_user = ?1),
           agg as (
             select partner, max(id) as last_id,
                    sum(case when to_user = ?1 and read_at is null then 1 else 0 end) as unread
             from mine group by partner order by last_id desc limit 100)
           select agg.partner, agg.unread, m.from_user, m.body, m.created, m.site,
                  u.id, u.name, u.email, u.image,
                  c.user_a, c.user_b, c.status, c.requested_by, c.blocked_by, c.created as c_created, c.updated as c_updated
           from agg
           join member_message m on m.id = agg.last_id
           join "user" u on u.id = agg.partner and coalesce(u.banned, 0) = 0
           left join member_connection c on c.user_a = min(?1, agg.partner) and c.user_b = max(?1, agg.partner)
           order by agg.last_id desc`,
        )
        .bind(meId)
        .all<UserRow & { partner: string; unread: number; from_user: string; body: string; created: number; site: string;
          user_a: string | null; user_b: string; status: ConnRow["status"]; requested_by: string; blocked_by: string | null; c_created: number; c_updated: number }>()
    ).results;
    const threads = [];
    let unread = 0;
    let requests = 0;
    for (const r of rows) {
      const c: ConnRow | null = r.user_a
        ? { user_a: r.user_a, user_b: r.user_b, status: r.status, requested_by: r.requested_by, blocked_by: r.blocked_by, created: r.c_created, updated: r.c_updated }
        : null;
      const rel = relation(c, meId);
      // Requests I ignored and people I blocked drop out of the Inbox.
      if (rel === "ignored" || rel === "blocked") continue;
      if (rel === "request_in") requests++;
      unread += r.unread;
      threads.push({
        with: person(r),
        relation: rel,
        unread: r.unread,
        last: { mine: r.from_user === meId, body: r.body.slice(0, 140), at: r.created, site: r.site },
      });
    }
    const started = await this.db
      .prepare(`select count(*) as n from member_connection where requested_by = ? and created > ?`)
      .bind(meId, t - DAY)
      .first<{ n: number }>();
    return {
      me: { id: me.id, name: (me.name ?? "").trim(), email: me.email, image: me.image, notify: settings?.notify !== 0 },
      newPeopleToday: { used: Math.min(started?.n ?? 0, NEW_PEOPLE_PER_DAY), of: NEW_PEOPLE_PER_DAY },
      unread,
      requests,
      threads,
    };
  }

  /** Just the counts, for a badge in a site's menu. Does not count as opening. */
  async counts(meId: string) {
    const r = await this.db
      .prepare(
        `select count(*) as n from member_message m
         left join member_connection c on c.user_a = min(m.from_user, m.to_user) and c.user_b = max(m.from_user, m.to_user)
         where m.to_user = ? and m.read_at is null
           and not (coalesce(c.status, '') = 'ignored' and c.requested_by <> m.to_user)
           and not (coalesce(c.status, '') = 'blocked' and c.blocked_by = m.to_user)`,
      )
      .bind(meId)
      .first<{ n: number }>();
    return { unread: r?.n ?? 0 };
  }

  /** One conversation; marks what I received as read. */
  async thread(meId: string, withId: string) {
    await this.me(meId);
    const other = await this.user(withId);
    if (!other || withId === meId) throw new InboxError("That person isn't here any more.", 404);
    const c = await this.conn(meId, withId);
    await this.db.prepare(`update member_message set read_at = ? where to_user = ? and from_user = ? and read_at is null`).bind(this.now(), meId, withId).run();
    const msgs = (
      await this.db
        .prepare(
          `select id, from_user, body, site, created from member_message
           where (from_user = ?1 and to_user = ?2) or (from_user = ?2 and to_user = ?1)
           order by id desc limit 200`,
        )
        .bind(meId, withId)
        .all<{ id: number; from_user: string; body: string; site: string; created: number }>()
    ).results.reverse();
    const rel = relation(c, meId);
    return {
      with: person(other),
      relation: rel,
      canSend: rel === "connected" || rel === "none" || rel === "request_in" || rel === "ignored",
      messages: msgs.map((m) => ({ id: m.id, mine: m.from_user === meId, body: m.body, site: m.site, at: m.created })),
    };
  }

  /** Send to a member by id (from the Inbox) or by email address (New message). */
  async send(meId: string, site: string, input: { to?: string; email?: string; body?: string }) {
    const me = await this.me(meId);
    if (!(me.name ?? "").trim()) throw new InboxError("Add your name first, so people know who's writing.", 422);
    const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!body) throw new InboxError("Write a message first.");
    if (body.length > MAX_BODY) throw new InboxError(`Keep it under ${MAX_BODY} characters.`);
    const t = this.now();

    let other: UserRow | null = null;
    if (input.to) other = await this.user(input.to);
    else if (input.email) {
      const email = String(input.email).trim().toLowerCase();
      const misses = await this.db
        .prepare(`select count(*) as n from member_lookup_miss where user_id = ? and created > ?`)
        .bind(meId, t - DAY)
        .first<{ n: number }>();
      if ((misses?.n ?? 0) >= LOOKUP_MISSES_PER_DAY) throw new InboxError("Too many addresses tried today. Try again tomorrow.", 429);
      other = await this.db
        .prepare(`select id, name, email, image from "user" where lower(email) = ? and coalesce(banned, 0) = 0`)
        .bind(email)
        .first<UserRow>();
      if (!other) {
        await this.db.prepare(`insert into member_lookup_miss (user_id, created) values (?, ?)`).bind(meId, t).run();
        throw new InboxError("No member uses that email address. They need to sign in to one of our sites once first.", 404);
      }
    }
    if (!other) throw new InboxError("That person isn't here any more.", 404);
    if (other.id === meId) throw new InboxError("That's you!");

    const c = await this.conn(meId, other.id);
    const rel = relation(c, meId);
    const writes: Stmt[] = [];
    let isRequest = false;
    switch (rel) {
      case "connected":
        break;
      case "request_in":
      case "ignored":
        // Writing back answers their request.
        writes.push(this.setConn(meId, other.id, "accepted", c!.requested_by));
        break;
      case "waiting":
        throw new InboxError(`Waiting for ${displayName(other)} to answer your request.`, 409);
      case "blocked":
        throw new InboxError("You blocked this person. Unblock them under Connections first.", 409);
      case "none": {
        const started = await this.db
          .prepare(`select count(*) as n from member_connection where requested_by = ? and created > ?`)
          .bind(meId, t - DAY)
          .first<{ n: number }>();
        if ((started?.n ?? 0) >= NEW_PEOPLE_PER_DAY) {
          throw new InboxError(`You've written to ${NEW_PEOPLE_PER_DAY} new people today. Try again tomorrow.`, 429);
        }
        writes.push(this.setConn(meId, other.id, "pending", meId));
        // A request after a removal starts afresh (and counts toward today's new people).
        if (c) writes.push(this.db.prepare(`update member_connection set created = ? where user_a = ? and user_b = ?`).bind(t, ...pair(meId, other.id)));
        isRequest = true;
        break;
      }
    }
    writes.push(this.db.prepare(`insert into member_message (from_user, to_user, body, site, created) values (?, ?, ?, ?, ?)`).bind(meId, other.id, body, site, t));
    writes.push(this.inboxRow(other.id));
    await this.db.batch(writes);
    await this.maybeNotify(other, person(me), site, isRequest);
    return { ok: true, to: person(other), request: isRequest };
  }

  private async maybeNotify(to: UserRow, from: Person, site: string, isRequest: boolean) {
    if (!this.deps.notify) return;
    const st = await this.db.prepare(`select notify, opened_at, noticed_at from member_inbox where user_id = ?`).bind(to.id).first<{ notify: number; opened_at: number; noticed_at: number }>();
    if (!st || !st.notify || st.noticed_at > st.opened_at) return;
    const t = this.now();
    const day = new Date(t).toISOString().slice(0, 10);
    const sent = await this.db.prepare(`select sent from member_notice_day where day = ?`).bind(day).first<{ sent: number }>();
    if ((sent?.sent ?? 0) >= NOTICES_PER_DAY) return;
    // Claim the notice before sending, so two quick messages can't both send one.
    await this.db.batch([
      this.db.prepare(`update member_inbox set noticed_at = ? where user_id = ?`).bind(t, to.id),
      this.db.prepare(`insert into member_notice_day (day, sent) values (?, 1) on conflict (day) do update set sent = sent + 1`).bind(day),
    ]);
    try {
      await this.deps.notify(noticeEmail(to, from, site, isRequest));
    } catch (err) {
      console.error("inbox notice failed", err);
    }
  }

  /** Answer a request, or change a connection: accept | ignore | block | unblock | remove. */
  async answer(meId: string, withId: string, action: string) {
    await this.me(meId);
    const other = await this.user(withId);
    if (!other || withId === meId) throw new InboxError("That person isn't here any more.", 404);
    const c = await this.conn(meId, withId);
    const rel = relation(c, meId);
    const [a, b] = pair(meId, withId);
    switch (action) {
      case "accept":
        if (rel !== "request_in" && rel !== "ignored") throw new InboxError("There's no request to accept.", 409);
        await this.setConn(meId, withId, "accepted", c!.requested_by).run();
        break;
      case "ignore":
        if (rel !== "request_in") throw new InboxError("There's no request to ignore.", 409);
        await this.setConn(meId, withId, "ignored", c!.requested_by).run();
        break;
      case "block":
        await this.setConn(meId, withId, "blocked", c?.requested_by ?? withId, meId).run();
        break;
      case "unblock":
        if (rel !== "blocked") throw new InboxError("This person isn't blocked.", 409);
        // Back to how a stranger starts: either may write a request again.
        await this.db.prepare(`delete from member_connection where user_a = ? and user_b = ?`).bind(a, b).run();
        break;
      case "remove":
        if (rel !== "connected") throw new InboxError("You aren't connected.", 409);
        await this.setConn(meId, withId, "removed", c!.requested_by).run();
        break;
      default:
        throw new InboxError("Unknown action.");
    }
    return { ok: true, relation: relation(await this.conn(meId, withId), meId) };
  }

  /** Connections tab: connected people, my unanswered requests, people I blocked. */
  async connections(meId: string) {
    await this.me(meId);
    const rows = (
      await this.db
        .prepare(
          `select c.*, u.id, u.name, u.email, u.image from member_connection c
           join "user" u on u.id = case when c.user_a = ?1 then c.user_b else c.user_a end and coalesce(u.banned, 0) = 0
           where c.user_a = ?1 or c.user_b = ?1 order by c.updated desc limit 500`,
        )
        .bind(meId)
        .all<ConnRow & UserRow>()
    ).results;
    const out = { connected: [] as (Person & { since: number })[], waiting: [] as (Person & { since: number })[], blocked: [] as (Person & { since: number })[] };
    for (const c of rows) {
      const rel = relation(c, meId);
      const list = rel === "connected" ? out.connected : rel === "waiting" ? out.waiting : rel === "blocked" ? out.blocked : null;
      if (list) list.push({ ...person(c), since: c.updated });
    }
    return out;
  }

  /**
   * For a brand site that keeps its own copy of connections (Bandturo): every
   * pair this member is in, as connected | removed | blocked | pending.
   * Only through the private site entrypoint.
   */
  async links(meId: string) {
    await this.me(meId);
    const rows = (await this.db.prepare(`select * from member_connection where user_a = ?1 or user_b = ?1`).bind(meId).all<ConnRow>()).results;
    return {
      links: rows.map((c) => ({
        with: c.user_a === meId ? c.user_b : c.user_a,
        status: c.status === "accepted" ? "connected" : c.status === "removed" || c.status === "blocked" ? c.status : "pending",
      })),
    };
  }

  /**
   * A brand site reports a connection its members made there (Bandturo:
   * accepting a Connect request). Connected on every site from then on,
   * unless one of them has blocked the other.
   */
  async link(meId: string, withId: string) {
    await this.me(meId);
    const other = await this.user(withId);
    if (!other || withId === meId) throw new InboxError("That person isn't here any more.", 404);
    const c = await this.conn(meId, withId);
    if (c?.status === "blocked") return { ok: true, relation: relation(c, meId) };
    if (c?.status !== "accepted") await this.setConn(meId, withId, "accepted", c?.requested_by ?? withId).run();
    return { ok: true, relation: "connected" as Relation };
  }

  /** Settings tab: display name and email notices. */
  async settings(meId: string, input: { name?: unknown; notify?: unknown }) {
    await this.me(meId);
    const writes: Stmt[] = [this.inboxRow(meId)];
    if (input.name !== undefined) {
      const name = String(input.name).replace(/\s+/g, " ").trim();
      if (!name) throw new InboxError("Your name can't be empty.");
      if (name.length > 60) throw new InboxError("Keep your name under 60 characters.");
      writes.push(this.db.prepare(`update "user" set name = ?, "updatedAt" = ? where id = ?`).bind(name, new Date(this.now()).toISOString(), meId));
    }
    if (input.notify !== undefined) {
      writes.push(this.db.prepare(`update member_inbox set notify = ? where user_id = ?`).bind(input.notify ? 1 : 0, meId));
    }
    await this.db.batch(writes);
    return { ok: true };
  }
}

/**
 * The Inbox over HTTP, for one signed-in member. Used by both the private
 * entrypoint the brand sites call (they vouch for the member) and the accounts
 * site's own /api/inbox (its session cookie vouches).
 *   GET  summary | counts | connections | thread?with=ID
 *   POST send {to|email, body} | answer {with, action} | settings {name?, notify?}
 * and, for brand sites only (opts.siteOps; never from a browser):
 *   GET  links             POST link {with}
 */
export async function inboxHttp(inbox: Inbox, meId: string, site: string, req: Request, op: string, opts: { siteOps?: boolean } = {}): Promise<Response> {
  try {
    const url = new URL(req.url);
    let out: unknown;
    if (req.method === "GET") {
      if (op === "summary") out = await inbox.summary(meId);
      else if (op === "counts") out = await inbox.counts(meId);
      else if (op === "connections") out = await inbox.connections(meId);
      else if (op === "thread") out = await inbox.thread(meId, url.searchParams.get("with") ?? "");
      else if (op === "links" && opts.siteOps) out = await inbox.links(meId);
    } else if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (op === "send") out = await inbox.send(meId, site, body as { to?: string; email?: string; body?: string });
      else if (op === "answer") out = await inbox.answer(meId, String(body.with ?? ""), String(body.action ?? ""));
      else if (op === "settings") out = await inbox.settings(meId, body);
      else if (op === "link" && opts.siteOps) out = await inbox.link(meId, String(body.with ?? ""));
    }
    if (out === undefined) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof InboxError) return Response.json({ error: err.message }, { status: err.status });
    console.error("inbox error", err);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
