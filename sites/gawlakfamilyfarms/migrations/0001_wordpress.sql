-- WordPress data the plugin relies on, kept under the original WordPress user ids
-- (the plugin has no tables of its own: everything it keeps is user meta and options).

CREATE TABLE wp_users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  registered TEXT,
  roles TEXT NOT NULL DEFAULT '[]',          -- JSON array from wp_capabilities
  account_id TEXT                             -- shared accounts-service id, set on first sign-in
);
CREATE UNIQUE INDEX wp_users_email ON wp_users (email);
CREATE UNIQUE INDEX wp_users_account ON wp_users (account_id);

-- Only the plugin's own keys (gff_*) plus first_name/last_name. Arrays the plugin stored as serialized PHP
-- are converted to JSON on import; other values are kept as WordPress stored them.
CREATE TABLE wp_usermeta (
  user_id INTEGER NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT,
  PRIMARY KEY (user_id, meta_key)
);

-- The plugin's settings (gff_*) and the few WordPress ones it reads, minus secrets, which live in Worker secrets.
CREATE TABLE wp_options (
  option_name TEXT PRIMARY KEY,
  option_value TEXT
);
