-- fppm.us's WordPress data the plugin relies on, kept under the original WordPress user ids.
-- The fppm-team-manager plugin has no tables of its own: members, waivers, dues, RSVPs and
-- orders are user meta; events, announcements, settings are options.

CREATE TABLE wp_users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  registered TEXT,                            -- UTC, Y-m-d H:i:s (wp_users.user_registered)
  roles TEXT NOT NULL DEFAULT '[]',          -- JSON array from bxb_capabilities, in stored order
  account_id TEXT                             -- shared accounts-service id, set on first sign-in
);
CREATE UNIQUE INDEX wp_users_email ON wp_users (email);
CREATE UNIQUE INDEX wp_users_account ON wp_users (account_id);

-- The plugin's keys (fppm_*) plus first_name/last_name. Values: serialized PHP arrays become
-- JSON; a plain string that itself starts with [ { or " is stored as a JSON string literal,
-- so it reads back as text (see src/ctx.ts encode/decode); anything else as WordPress stored it.
CREATE TABLE wp_usermeta (
  user_id INTEGER NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT,
  PRIMARY KEY (user_id, meta_key)
);

-- The plugin's settings (fppm_*), GFF Drive Backup's (gff_dbk_*) and the few WordPress ones they
-- read, minus credentials, which are Worker secrets. Same value encoding as wp_usermeta.
CREATE TABLE wp_options (
  option_name TEXT PRIMARY KEY,
  option_value TEXT
);
