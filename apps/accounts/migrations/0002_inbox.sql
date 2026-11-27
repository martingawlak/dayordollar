-- Messages between members, shared by every site (Martin, 2026-11-27).
-- In-app only: nothing here is ever sent to an outside address except the
-- "you have a new message" notice to the member's own email.

-- One row per pair of members, stored with user_a < user_b.
--   pending  : requested_by wrote first; the other has not answered yet
--   accepted : connected; both write freely
--   ignored  : the other ignored the request (the requester is not told)
--   blocked  : blocked_by blocked the other (the blocked one is not told)
create table "member_connection" (
  "user_a" text not null references "user" ("id") on delete cascade,
  "user_b" text not null references "user" ("id") on delete cascade,
  "status" text not null,
  "requested_by" text not null,
  "blocked_by" text,
  "created" integer not null,
  "updated" integer not null,
  primary key ("user_a", "user_b")
);
create index "member_connection_b_idx" on "member_connection" ("user_b");
create index "member_connection_req_idx" on "member_connection" ("requested_by", "created");

create table "member_message" (
  "id" integer primary key autoincrement,
  "from_user" text not null references "user" ("id") on delete cascade,
  "to_user" text not null references "user" ("id") on delete cascade,
  "body" text not null,
  -- the brand site it was written on (@mgc/brands id)
  "site" text not null,
  "created" integer not null,
  "read_at" integer
);
create index "member_message_to_idx" on "member_message" ("to_user", "read_at");
create index "member_message_from_idx" on "member_message" ("from_user");

-- Per member: email notices on/off, when they last opened the Inbox, when the
-- last notice went out. A notice goes only if none was sent since the last open.
create table "member_inbox" (
  "user_id" text primary key references "user" ("id") on delete cascade,
  "notify" integer not null default 1,
  "opened_at" integer not null default 0,
  "noticed_at" integer not null default 0
);

-- Notices sent per UTC day (capped so sign-in codes keep Resend's daily room).
create table "member_notice_day" ("day" text primary key, "sent" integer not null);

-- "No member with that email" answers, to limit address guessing.
create table "member_lookup_miss" (
  "user_id" text not null references "user" ("id") on delete cascade,
  "created" integer not null
);
create index "member_lookup_miss_idx" on "member_lookup_miss" ("user_id", "created");
