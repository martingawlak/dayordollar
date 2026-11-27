-- Shop orders paid through Stripe Checkout (the carried-over WooCommerce shop: the Legacy Starter Deck).
-- One row per completed Checkout Session; the session id makes recording
-- idempotent when Stripe delivers the same event twice.
CREATE TABLE shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session TEXT NOT NULL UNIQUE,
  stripe_event TEXT,
  site TEXT NOT NULL,
  account_id TEXT,                 -- the shared accounts-service id, when signed in
  customer TEXT,                   -- the Stripe Customer
  email TEXT,
  name TEXT,
  product_id INTEGER,
  variation_id INTEGER,
  sku TEXT,
  item TEXT,                       -- product name and options, as sold
  quantity INTEGER NOT NULL DEFAULT 1,
  amount_total INTEGER NOT NULL,   -- cents
  currency TEXT NOT NULL,
  shipping TEXT,                   -- JSON: name and address from Checkout
  status TEXT NOT NULL,            -- paid | sent_to_printful | needs_manual_printful | needs_fulfilment
  printful_order TEXT,
  note TEXT,
  created TEXT NOT NULL            -- UTC, Y-m-d H:i:s
);
CREATE INDEX shop_orders_account ON shop_orders (account_id);
CREATE INDEX shop_orders_email ON shop_orders (email);
