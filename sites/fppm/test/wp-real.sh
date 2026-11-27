#!/bin/sh
# A local copy of fppm.us: real WordPress 7.1.5 (the live site's version, db_version 61833) with
# the Twenty Twenty-Five theme, the site's plugins (fppm-team-manager, gff-drive-backup and
# Nextend Social Login) and test/wp-real/fppm-test-mu.php, on a copy of Martin's export.
# Used by scripts/gen-shell.py (the theme frame) and test/pages.test.ts (whole-page comparison).
#
#   sh test/wp-real.sh <dir outside the repo> [port]     (fppm_old must hold the export:
#     mysql -e 'create database fppm_old character set utf8mb4'
#     sed 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' export.sql | mysql fppm_old)
# then: FPPM_WP_URL=http://127.0.0.1:<port> FPPM_WP_DB=fppm_wp npx tsx test/pages.test.ts
set -e
DIR=$1; PORT=${2:-8099}
HERE=$(cd "$(dirname "$0")/.." && pwd)
PLUGINS=$HERE/../../imports/siteground/fppm.us/wp-content/plugins
[ -n "$DIR" ] || { echo "usage: sh test/wp-real.sh <dir> [port]" >&2; exit 1; }
sh "$HERE/scripts/db-up.sh"
mkdir -p "$DIR"
if [ ! -f "$DIR/wp/wp-settings.php" ]; then
  curl -sL -o "$DIR/wp.tar.gz" https://wordpress.org/wordpress-7.1.5.tar.gz
  tar xzf "$DIR/wp.tar.gz" -C "$DIR" && mv "$DIR/wordpress" "$DIR/wp"
  curl -sL -o "$DIR/nsl.zip" https://downloads.wordpress.org/plugin/nextend-facebook-connect.zip
  (cd "$DIR/wp/wp-content/plugins" && unzip -qo "$DIR/nsl.zip")
fi
cp -r "$PLUGINS/fppm-team-manager" "$PLUGINS/gff-drive-backup" "$DIR/wp/wp-content/plugins/"
mkdir -p "$DIR/wp/wp-content/mu-plugins" && cp "$HERE/test/wp-real/fppm-test-mu.php" "$DIR/wp/wp-content/mu-plugins/"
# The site's uploads as far as the repo has them (fonts, the crest's sizes), for screenshots.
cp -r "$HERE/public/wp-content/uploads" "$DIR/wp/wp-content/"
mysql -uroot -e "drop database if exists fppm_wp; create database fppm_wp character set utf8mb4; create user if not exists 'wp'@'localhost' identified by 'wp'; grant all on fppm_wp.* to 'wp'@'localhost'"
mysqldump -uroot fppm_old | mysql -uroot fppm_wp
# Only the plugins that shape the pages (Wordfence and SiteGround's are not needed to render).
mysql -uroot fppm_wp -e "update bxb_options set option_value='a:3:{i:0;s:39:\"fppm-team-manager/fppm-team-manager.php\";i:1;s:37:\"gff-drive-backup/gff-drive-backup.php\";i:2;s:53:\"nextend-facebook-connect/nextend-facebook-connect.php\";}' where option_name='active_plugins'"
cat > "$DIR/wp/wp-config.php" <<'EOF'
<?php
define('DB_NAME', 'fppm_wp'); define('DB_USER', 'wp'); define('DB_PASSWORD', 'wp'); define('DB_HOST', 'localhost:/run/mysqld/mysqld.sock');
define('DB_CHARSET', 'utf8mb4'); define('DB_COLLATE', '');
$table_prefix = 'bxb_';
foreach (['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'] as $k) define($k, 'local-copy');
define('WP_DEBUG', false); define('DISABLE_WP_CRON', true); define('AUTOMATIC_UPDATER_DISABLED', true);
// Links stay https://fppm.us (ask with "Host: fppm.us"), unless LOCAL_HOME is set (for a browser).
$_SERVER['HTTPS'] = 'on';
if (getenv('LOCAL_HOME')) { define('WP_HOME', getenv('LOCAL_HOME')); define('WP_SITEURL', getenv('LOCAL_HOME')); unset($_SERVER['HTTPS']); }
if (!defined('ABSPATH')) define('ABSPATH', __DIR__ . '/');
require_once ABSPATH . 'wp-settings.php';
EOF
cd "$DIR/wp" && (setsid nohup php -S 127.0.0.1:$PORT > "$DIR/server.log" 2>&1 &)
sleep 1
echo "local fppm.us copy on http://127.0.0.1:$PORT (send Host: fppm.us)"
