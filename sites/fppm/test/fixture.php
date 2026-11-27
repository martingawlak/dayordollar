<?php
/**
 * Builds fppm_fixture: a made-up fppm.us database (WordPress tables with the
 * export's bxb_ prefix) for the parity tests. Every person here is invented
 * (example.test addresses, 555 phone numbers); the settings mirror the live
 * site's shape, with test values for the credentials.
 *
 *   php test/fixture.php    (MariaDB running: scripts/db-up.sh)
 */
$db = new mysqli('localhost', 'root', '', '', 0, '/run/mysqld/mysqld.sock');
$db->set_charset('utf8mb4');
$db->query('DROP DATABASE IF EXISTS fppm_fixture');
$db->query('CREATE DATABASE fppm_fixture CHARACTER SET utf8mb4');
$db->select_db('fppm_fixture');
$db->query("CREATE TABLE bxb_users (ID bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY, user_login varchar(60) NOT NULL DEFAULT '', user_pass varchar(255) NOT NULL DEFAULT '',
	user_nicename varchar(50) NOT NULL DEFAULT '', user_email varchar(100) NOT NULL DEFAULT '', user_url varchar(100) NOT NULL DEFAULT '', user_registered datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
	user_activation_key varchar(255) NOT NULL DEFAULT '', user_status int NOT NULL DEFAULT 0, display_name varchar(250) NOT NULL DEFAULT '') DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci");
$db->query("CREATE TABLE bxb_usermeta (umeta_id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id bigint unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci");
$db->query("CREATE TABLE bxb_options (option_id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY, option_name varchar(191) NOT NULL DEFAULT '' UNIQUE, option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes') DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci");

function q($v) { global $db; return "'" . $db->real_escape_string((string) $v) . "'"; }
function v($x) { return is_array($x) ? serialize($x) : (string) $x; }
function user($id, $login, $email, $display, $registered, $role) {
	global $db;
	$db->query("INSERT INTO bxb_users (ID, user_login, user_email, user_registered, display_name, user_nicename) VALUES ($id, " . q($login) . ', ' . q($email) . ', ' . q($registered) . ', ' . q($display) . ', ' . q(strtolower(preg_replace('/[^a-z0-9]+/i', '-', $login))) . ')');
	meta($id, 'bxb_capabilities', $role ? array($role => true) : array());
}
function meta($uid, $k, $val) { global $db; $db->query('INSERT INTO bxb_usermeta (user_id, meta_key, meta_value) VALUES (' . (int) $uid . ', ' . q($k) . ', ' . q(v($val)) . ')'); }
function opt($k, $val) { global $db; $db->query('INSERT INTO bxb_options (option_name, option_value) VALUES (' . q($k) . ', ' . q(v($val)) . ')'); }
function waiver($uid, $at, $name, $email, $ip, $ver = '1.0', $hash = 'd41d8cd98f00b204e9800998ecf8427e') {
	meta($uid, 'fppm_waiver', array('accepted' => 1, 'version' => $ver, 'hash' => $hash, 'at' => $at, 'ip' => $ip, 'ua' => 'Mozilla/5.0 (Test)', 'name' => $name, 'email' => $email));
	meta($uid, 'fppm_oath', array('accepted' => 1, 'at' => $at, 'text' => 'I take the Purple Martins oath: to spread the culture of abundance whenever I represent this organization.'));
}
function member($uid, $type, $first, $last, $phone, $addr, $city, $state, $zip, $joined) {
	meta($uid, 'first_name', $first); meta($uid, 'last_name', $last);
	meta($uid, 'fppm_type', $type); meta($uid, 'fppm_phone', $phone); meta($uid, 'fppm_address', $addr); meta($uid, 'fppm_city', $city);
	meta($uid, 'fppm_state', $state); meta($uid, 'fppm_zip', $zip); meta($uid, 'fppm_optin', 1); meta($uid, 'fppm_joined', $joined);
}

/* The roles and the capabilities the plugin asks about, as the site's bxb_user_roles holds them. */
$admin_caps = array();
foreach (array('switch_themes', 'edit_themes', 'activate_plugins', 'edit_plugins', 'edit_users', 'edit_files', 'manage_options', 'moderate_comments', 'list_users', 'delete_users', 'create_users', 'read', 'level_10', 'fppm_manage') as $c) $admin_caps[$c] = true;
opt('bxb_user_roles', array(
	'administrator' => array('name' => 'Administrator', 'capabilities' => $admin_caps),
	'editor' => array('name' => 'Editor', 'capabilities' => array('read' => true, 'edit_posts' => true)),
	'subscriber' => array('name' => 'Subscriber', 'capabilities' => array('read' => true, 'level_0' => true)),
	'customer' => array('name' => 'Customer', 'capabilities' => array('read' => true)),
	'fppm_member' => array('name' => 'FPPM Member', 'capabilities' => array('read' => true)),
	'fppm_staff' => array('name' => 'FPPM Staff', 'capabilities' => array('read' => true, 'fppm_manage' => true)),
));

/* People (all invented). */
user(1, 'ada.admin', 'admin@example.test', 'Ada Admin', '2026-07-11 16:30:47', 'administrator');
user(2, 'cole.coach', 'coach@example.test', 'Cole Coach', '2026-08-01 10:00:00', 'fppm_staff');
user(3, 'fan1', 'fan1@example.test', 'Fay Fan', '2026-09-02 13:14:15', 'fppm_member');
member(3, 'fan', 'Fay', 'Fan', '772-555-0103', '3 Ocean Dr', 'Fort Pierce', 'FL', '34949', '2026-09-02 09:14:15');
waiver(3, '2026-09-02 09:14:15', 'Fay Fan', 'fan1@example.test', '203.0.113.3');
meta(3, 'fppm_coupon', 'FPPMFF110'); meta(3, 'fppm_waiver_synced', 1);
user(4, 'player1', 'player1@example.test', 'Pat Player', '2026-09-05 18:00:00', 'fppm_member');
member(4, 'player', 'Pat', 'Player', '772-555-0104', '44 Orange Ave', 'Fort Pierce', 'FL', '34950', '2026-09-05 14:00:00');
waiver(4, '2026-09-05 14:00:00', 'Pat Player', 'player1@example.test', '203.0.113.4');
meta(4, 'fppm_player_status', 'trialist'); meta(4, 'fppm_position', 'ST'); meta(4, 'fppm_jersey', '9'); meta(4, 'fppm_dob', '1999-04-01');
meta(4, 'fppm_ec_name', 'Pam Player'); meta(4, 'fppm_ec_phone', '772-555-0144'); meta(4, 'fppm_coupon', 'FPPMPP210'); meta(4, 'fppm_waiver_synced', 0);
meta(4, 'fppm_dues_log', array(array('num' => 1, 'amount' => '10.00', 'overview' => 'Player dues', 'created' => '2026-09-05 14:00:00', 'status' => 'open', 'paid_at' => '', 'paid_by' => 0)));
user(5, 'supporter1', 'supporter1@example.test', 'Sam Supporter', '2026-10-10 15:30:00', 'fppm_member');
member(5, 'supporter', 'Sam', 'Supporter', '772-555-0105', '5 Seaway Dr, Apt 2', 'Fort Pierce', 'FL', '34949', '2026-10-10 11:30:00');
waiver(5, '2026-10-10 11:30:00', 'Sam Supporter', 'supporter1@example.test', '203.0.113.5');
meta(5, 'fppm_shirt', 'L'); meta(5, 'fppm_contribution', '40.00'); meta(5, 'fppm_coupon', 'FPPMSS310'); meta(5, 'fppm_waiver_synced', 1);
meta(5, 'fppm_dues_log', array(array('num' => 1, 'amount' => '40.00', 'overview' => 'Supporter contribution (incl. tee + 10% merch code)', 'created' => '2026-10-10 11:30:00', 'status' => 'paid', 'paid_at' => '2026-10-11 08:00:00', 'paid_by' => 2)));
meta(5, 'fppm_orders', array(array('at' => '2026-10-20 12:00:00', 'variant' => 5001, 'amount' => 22.5, 'paypal' => 'PAYPAL-OLD-1', 'printful' => 777)));
user(6, 'google.user@example.test', 'google.user@example.test', 'google.user@example.test', '2026-11-01 12:00:00', 'subscriber');
user(7, 'invitee', 'invitee@example.test', 'Ivy Invitee', '2026-11-02 12:00:00', 'fppm_member');
member(7, 'fan', 'Ivy', 'Invitee', '772-555-0107', '7 Indrio Rd', 'Fort Pierce', 'FL', '34951', '2026-11-02 08:00:00');
waiver(7, '2026-11-02 08:00:00', 'Ivy Invitee', 'invitee@example.test', '203.0.113.7');
meta(7, 'fppm_player_invite', array('pending' => 1, 'by' => 2, 'at' => '2026-11-15 10:00:00'));
user(8, 'tricky', 'tricky@example.test', 'Zoë O\'Neil', '2026-11-03 12:00:00', 'fppm_member');
member(8, 'player', 'Zoë', 'O\'Neil <b>&amp;', '772-555-0108', '8 "Quoted" Ln', 'Port St. Lucie', 'FL', '34952', '2026-11-03 08:00:00');
waiver(8, '2026-11-03 08:00:00', 'Zoë O\'Neil <b>&amp;', 'tricky@example.test', '2001:db8::8', '0.9', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
meta(8, 'fppm_player_status', 'rostered'); meta(8, 'fppm_position', 'GK'); meta(8, 'fppm_notes', "Keeper <b>gloves</b>\nNeeds kit");
meta(8, 'fppm_dues_log', array(
	array('num' => 1, 'amount' => '10.00', 'overview' => 'Player dues', 'created' => '2026-11-03 08:00:00', 'status' => 'open', 'paid_at' => '', 'paid_by' => 0),
	array('num' => 2, 'amount' => '5.50', 'overview' => 'Kit', 'created' => '2026-11-04 08:00:00', 'status' => 'open', 'paid_at' => '', 'paid_by' => 0),
));
user(9, 'active', 'activeplayer@example.test', 'Al Active', '2026-11-04 12:00:00', 'fppm_member');
member(9, 'player', 'Al', 'Active', '', '9 US-1', 'Fort Pierce', 'fl', '34982', '2026-11-04 08:00:00');
waiver(9, '2026-11-04 08:00:00', 'Al Active', 'activeplayer@example.test', '203.0.113.9');
meta(9, 'fppm_player_status', 'rostered'); meta(9, 'fppm_player_active', '1'); meta(9, 'fppm_player_activated', '2026-11-05 08:00:00');

/* Settings, shaped like the live site's. */
foreach (array(
	'blogname' => 'FPPM', 'blogdescription' => 'Fort Pierce Purple Martins FC', 'admin_email' => 'admin@example.test',
	'timezone_string' => 'America/New_York', 'gmt_offset' => '', 'date_format' => 'F j, Y', 'time_format' => 'g:i a', 'default_role' => 'subscriber',
	'fppm_team_name' => 'Fort Pierce Purple Martins', 'fppm_team_city' => 'Fort Pierce, FL', 'fppm_notify_email' => '',
	'fppm_price_player_dues' => '10', 'fppm_price_supporter_min' => '25', 'fppm_price_tshirt' => '25', 'fppm_price_embroidery' => '5',
	'fppm_coupon_amount' => '', 'fppm_coupon_percent' => '10', 'fppm_supporter_code_pool' => '', 'fppm_shared_promo' => '', 'fppm_collective' => '',
	'fppm_shop_url' => 'https://fppm.us', 'fppm_tshirt_url' => '', 'fppm_wc_tshirt_id' => '0', 'fppm_wc_dues_id' => '0', 'fppm_wc_supporter_id' => '0',
	'fppm_pp_dues' => '', 'fppm_pp_supporter' => '', 'fppm_pp_tshirt' => '', 'fppm_pp_env' => 'sandbox', 'fppm_pp_client_id' => 'test-client-id',
	'fppm_pp_secret' => 'test-pp-secret', 'fppm_printful_token' => 'test-pf-token', 'fppm_printful_store_id' => '123', 'fppm_printful_confirm' => '1',
	'fppm_tee_variants' => '', 'fppm_shirts_sold_manual' => '0', 'fppm_waiver_version' => '1.0', 'fppm_waiver_text' => '', 'fppm_oath_text' => '',
	'fppm_gs_json' => '', 'fppm_gs_sheet_id' => '', 'fppm_gs_tab' => 'Waivers', 'fppm_login_gate' => '1', 'fppm_join_url' => '', 'fppm_public_slugs' => '',
	'fppm_join_intro' => '', 'fppm_seed_conditioning' => '1', 'fppm_coupon_codes' => array('FPPMFF110', 'FPPMPP210', 'FPPMSS310'),
	'gff_dbk_last_log' => "2026-11-19 23:01:00 \xE2\x80\x94 SKIPPED: main GFF plugin not active (gff_reg_collect_clients missing).",
) as $k => $val) opt($k, $val);
opt('fppm_store_catalog', json_encode(array(
	array('name' => 'Purple Martins Tee', 'img' => 'https://files.example.test/tee.png', 'variants' => array(
		array('label' => 'M', 'id' => 5001, 'price' => 25, 'img' => 'https://files.example.test/tee-m.png'),
		array('label' => 'L', 'id' => 5002, 'price' => 25, 'img' => ''),
		array('label' => 'XXL', 'id' => 5003, 'price' => 27.5, 'img' => 'https://files.example.test/tee-xxl.png'),
	)),
	array('name' => 'Litty "Committee" Hoodie & Cap', 'img' => '', 'variants' => array(
		array('label' => '', 'id' => 6001, 'price' => 49.99),
	)),
	array('name' => 'Broken', 'variants' => array(array('label' => 'x'))),
), JSON_PRETTY_PRINT));
opt('fppm_events', array(
	array('id' => 1, 'type' => 'conditioning', 'recur' => 'weekly', 'weekday' => 6, 'title' => '', 'date' => '', 'time' => '08:00', 'end' => '09:00',
		'location' => 'Dan McCarty Track', 'lat' => '27.431200215726122', 'lng' => '-80.33686374487264',
		'notes' => 'Players meet at the Dan McCarty Track parking lot for conditioning.', 'rsvps' => array(9 => 'in', 4 => 'maybe')),
	array('id' => 2, 'type' => 'match', 'recur' => 'none', 'weekday' => 6, 'title' => 'Miami United', 'date' => '2026-11-28', 'time' => '19:30', 'end' => '',
		'location' => 'Lawnwood Stadium, Fort Pierce', 'lat' => '', 'lng' => '', 'notes' => 'Bring a friend; tickets "at the gate".', 'rsvps' => array(5 => 'in', 4 => 'out')),
	array('id' => 3, 'type' => 'practice', 'recur' => 'none', 'weekday' => 6, 'title' => '', 'date' => '2026-11-10', 'time' => '18:00', 'end' => '19:30',
		'location' => '', 'lat' => '', 'lng' => '', 'notes' => '', 'rsvps' => array()),
	array('id' => 5, 'type' => 'event', 'recur' => 'none', 'weekday' => 6, 'title' => 'Team BBQ', 'date' => '2026-12-05', 'time' => '', 'end' => '',
		'location' => 'Jetty Park', 'lat' => '', 'lng' => '', 'notes' => '', 'rsvps' => array()),
));
opt('fppm_announcements', array(
	array('title' => 'Welcome', 'body' => "First conditioning is Saturday.\nBring water <and> cleats.", 'at' => '2026-11-01 09:00:00', 'by' => 1),
	array('title' => 'Kits & "colors"', 'body' => 'Purple at home.', 'at' => '2026-11-12 18:30:00', 'by' => 2),
));
opt('cron', array(1795838460 => array('gff_dbk_daily_event' => array('40cd750bba9870f18aada2478b24840a' => array('schedule' => 'daily', 'args' => array(), 'interval' => 86400))), 'version' => 2));

echo "fppm_fixture: ", $db->query('SELECT COUNT(*) FROM bxb_users')->fetch_row()[0], " users, ",
	$db->query("SELECT COUNT(*) FROM bxb_usermeta WHERE meta_key = 'fppm_waiver'")->fetch_row()[0], " waivers\n";
