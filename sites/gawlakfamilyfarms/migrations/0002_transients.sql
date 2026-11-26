-- WordPress transients the plugin uses (short-lived values with an expiry):
-- the gff_consent_<token> records of the consent flow.
CREATE TABLE transients (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL   -- unix seconds
);
