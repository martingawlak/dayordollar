-- WordPress transients the plugin uses: the PayPal access token (fppm_pp_tok_<env>) and
-- checkouts waiting for capture (fppm_ord_<paypal order id>, one hour).
CREATE TABLE transients (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,       -- same encoding as wp_options
  expires_at INTEGER NOT NULL   -- unix seconds
);
