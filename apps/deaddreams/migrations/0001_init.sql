-- Dead Dreams Booking: events (inventory), customers, orders and digital tickets.
-- Times are unix milliseconds, except event times, which are local wall-clock
-- strings ("2026-12-05T20:00") in the site's time zone (America/New_York).

CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,          -- the ticket link: /e/<slug>
  title         TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  doors_at      TEXT,
  venue         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER NOT NULL,
  capacity      INTEGER NOT NULL,              -- total tickets for the show
  hard_tickets  INTEGER NOT NULL DEFAULT 0,    -- printed tickets held by locals, not sold online
  max_per_order INTEGER NOT NULL DEFAULT 10,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | published | cancelled
  fb_event_url  TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX events_starts ON events (status, starts_at);

CREATE TABLE customers (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,      -- lower-cased
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL DEFAULT '',
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  sso_user_id      TEXT,                      -- set when they buy while signed in
  notes            TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX customers_sso ON customers (sso_user_id);

CREATE TABLE orders (
  id                TEXT PRIMARY KEY,         -- long random id: the private order link
  code              TEXT NOT NULL UNIQUE,     -- short reference, e.g. DD-7K3QX (payment note)
  event_id          TEXT NOT NULL REFERENCES events (id),
  customer_id       TEXT NOT NULL REFERENCES customers (id),
  quantity          INTEGER NOT NULL,
  unit_cents        INTEGER NOT NULL,
  tip_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL,
  method            TEXT NOT NULL,            -- card | cashapp | venmo | paypal | zelle | comp | free
  status            TEXT NOT NULL,            -- pending | paid | cancelled | refunded
  stripe_session_id TEXT,
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,         -- a pending order holds its tickets until then
  paid_at           INTEGER,
  confirmed_by      TEXT                      -- staff email that marked a manual payment paid
);
CREATE INDEX orders_event ON orders (event_id, status);
CREATE INDEX orders_customer ON orders (customer_id);

CREATE TABLE tickets (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,         -- what the QR code holds
  order_id      TEXT NOT NULL REFERENCES orders (id),
  event_id      TEXT NOT NULL REFERENCES events (id),
  seq           INTEGER NOT NULL,             -- 1..quantity within the order
  status        TEXT NOT NULL DEFAULT 'valid', -- valid | void
  checked_in_at INTEGER,
  checked_in_by TEXT,
  UNIQUE (order_id, seq)
);
CREATE INDEX tickets_event ON tickets (event_id);
