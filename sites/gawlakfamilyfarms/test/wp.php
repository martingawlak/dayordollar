<?php
/**
 * WordPress, as far as the gff-customer-registration plugin needs it, against the gff_fixture
 * MariaDB database (a copy of the live data with credentials removed or
 * replaced by test values). The plugin itself is loaded whole (load_plugin()), with its
 * hooks, shortcodes and AJAX handlers recorded so a test can call them.
 *
 * Shared by the parity tests' PHP halves.
 */
define('ABSPATH', __DIR__ . '/wp-stub/');
foreach (['DAY_IN_SECONDS' => 86400, 'HOUR_IN_SECONDS' => 3600, 'MINUTE_IN_SECONDS' => 60, 'WEEK_IN_SECONDS' => 604800, 'MONTH_IN_SECONDS' => 2592000, 'YEAR_IN_SECONDS' => 31536000] as $k => $v) define($k, $v);
$GLOBALS['NOW'] = $GLOBALS['NOW'] ?? time();
$GLOBALS['RPC'] = $GLOBALS['RPC'] ?? '';
$GLOBALS['MAIL'] = [];
$GLOBALS['UID'] = $GLOBALS['UID'] ?? 0;

final class JsonReply extends Exception { public function __construct(public array $body) { parent::__construct('json'); } }

class FixtureWpdb {
	public $prefix = 'svz_';
	public $usermeta = 'svz_usermeta';
	public $insert_id = 0;
	public mysqli $db;
	function __construct() { $this->db = new mysqli('localhost', 'root', '', 'gff_fixture', 0, '/run/mysqld/mysqld.sock'); $this->db->set_charset('utf8mb4'); }
	private function lit($v) { return $v === null ? 'NULL' : (is_int($v) || is_float($v) ? (string) $v : "'" . $this->db->real_escape_string((string) $v) . "'"); }
	function prepare($q, ...$args) {
		if (count($args) === 1 && is_array($args[0])) $args = $args[0];
		$i = 0;
		return preg_replace_callback('/%[dsf]/', function ($m) use (&$i, $args) {
			$v = $args[$i++];
			return $m[0] === '%d' ? (string) (int) $v : ($m[0] === '%f' ? (string) (float) $v : "'" . $this->db->real_escape_string((string) $v) . "'");
		}, $q);
	}
	function query($q) { $r = $this->db->query($q); return $r === true ? $this->db->affected_rows : ($r ? $r->num_rows : false); }
	function get_results($q, $o = OBJECT) { $r = $this->db->query($q); $out = []; while ($x = $r->fetch_object()) $out[] = $o === ARRAY_A ? (array) $x : $x; return $out; }
	function get_row($q, $o = OBJECT) { return $this->get_results($q, $o)[0] ?? null; }
	function get_var($q) { $r = $this->db->query($q)->fetch_row(); return $r ? $r[0] : null; }
	function get_col($q) { return array_map(fn($o) => array_values((array) $o)[0], $this->get_results($q)); }
	function insert($t, $data, $f = null) {
		// wpdb reports a refused insert (e.g. a unique key) as false; it never throws.
		try { $ok = $this->db->query("INSERT INTO `$t` (`" . implode('`,`', array_keys($data)) . '`) VALUES (' . implode(',', array_map([$this, 'lit'], $data)) . ')'); }
		catch (mysqli_sql_exception $e) { $ok = false; }
		$this->insert_id = $this->db->insert_id;
		return $ok ? 1 : false;
	}
	function update($t, $data, $where, $f = null, $wf = null) {
		$set = implode(',', array_map(fn($k) => "`$k` = " . $this->lit($data[$k]), array_keys($data)));
		$w = implode(' AND ', array_map(fn($k) => "`$k` = " . $this->lit($where[$k]), array_keys($where)));
		$this->db->query("UPDATE `$t` SET $set WHERE $w");
		return $this->db->affected_rows;
	}
	function delete($t, $where, $wf = null) {
		$w = implode(' AND ', array_map(fn($k) => "`$k` = " . $this->lit($where[$k]), array_keys($where)));
		$this->db->query("DELETE FROM `$t` WHERE $w");
		return $this->db->affected_rows;
	}
	function esc_like($s) { return addcslashes($s, '_%\\'); }
}
if (!defined('OBJECT')) { define('OBJECT', 'OBJECT'); define('ARRAY_A', 'ARRAY_A'); }
$GLOBALS['wpdb'] = new FixtureWpdb();

/* ---- WordPress, as far as the handlers need it ---- */
function time_now() { return $GLOBALS['NOW']; }
/** WordPress's current_time('timestamp'): now, shifted by the site's timezone (or gmt_offset). */
function current_time($type, $gmt = 0) {
	$tz = (string) get_option('timezone_string', '');
	$off = $tz !== '' ? (new DateTimeZone($tz))->getOffset(new DateTime('@' . time_now())) / 3600 : (float) get_option('gmt_offset', 0);
	$ts = time_now() + ($gmt ? 0 : (int) ($off * 3600));
	// As WordPress: 'timestamp' / 'U' give the number, 'mysql' the datetime, anything else is a date() format.
	return ($type === 'timestamp' || $type === 'U') ? $ts : gmdate($type === 'mysql' ? 'Y-m-d H:i:s' : $type, $ts);
}
function check_ajax_referer($a, $b = false, $die = true) { return true; } // the Worker checks the origin instead
// As WordPress: no data, no 'data' key.
function wp_send_json_success($d = null, $status = null) { throw new JsonReply(['success' => true] + (isset($d) ? ['data' => $d] : []) + ($status ? ['__status' => $status] : [])); }
/* The HTTP status, when the plugin set one, rides along as __status (the Worker must answer with the same). */
function wp_send_json_error($d = null, $status = null) { throw new JsonReply(['success' => false] + (isset($d) ? ['data' => $d] : []) + ($status ? ['__status' => $status] : [])); }
function wp_send_json($d) { throw new JsonReply($d); }
function get_current_user_id() { return $GLOBALS['UID']; }
function is_user_logged_in() { return $GLOBALS['UID'] > 0; }
/** current_user_can(): the user's roles' capabilities from the site's own role table (svz_user_roles), plus 'edit_user' on oneself. */
function current_user_can($c, ...$args) { return user_can(get_current_user_id(), $c, ...$args); }
function wp_get_current_user() { $u = get_userdata(get_current_user_id()); return $u ? $u : new TestUser((object) ["ID" => 0, "display_name" => "", "user_email" => ""]); }
function wp_unslash($v) { return $v; }
/** _sanitize_text_fields(): WordPress's rules — tags out, a stray < kept as text, %xx octets removed. */
function wp_sanitize_text($str, $keep_newlines) {
	$f = (string) $str;
	if (str_contains($f, '<')) {
		$f = preg_replace_callback('%<[^>]*?((?=<)|>|$)%', fn($m) => str_ends_with($m[0], '>') ? $m[0] : esc_html($m[0]), $f);
		$f = preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', $f);
		$f = strip_tags($f);
		$f = str_replace("<\n", "&lt;\n", $f);
	}
	if (!$keep_newlines) $f = preg_replace('/[\r\n\t ]+/', ' ', $f);
	$f = trim($f);
	$found = false;
	while (preg_match('/%[a-f0-9]{2}/i', $f, $m)) { $f = str_replace($m[0], '', $f); $found = true; }
	if ($found) $f = trim(preg_replace('/ +/', ' ', $f));
	return $f;
}
function sanitize_text_field($s) { return wp_sanitize_text($s, false); }
function sanitize_textarea_field($s) { return wp_sanitize_text($s, true); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
/** is_email() and sanitize_email(): WordPress's own rules (not PHP's generic validator). */
function is_email($email) {
	$email = (string) $email;
	if (strlen($email) < 6 || strpos($email, '@', 1) === false) return false;
	[$local, $domain] = explode('@', $email, 2);
	if (!preg_match('/^[a-zA-Z0-9!#$%&\'*+\/=?^_`{|}~\.-]+$/', $local)) return false;
	if (preg_match('/\.{2,}/', $domain) || trim($domain, " \t\n\r\0\x0B.") !== $domain) return false;
	$subs = explode('.', $domain);
	if (count($subs) < 2) return false;
	foreach ($subs as $sub) { if (trim($sub, " \t\n\r\0\x0B-") !== $sub || !preg_match('/^[a-z0-9-]+$/i', $sub)) return false; }
	return $email;
}
function sanitize_email($email) {
	$email = (string) $email;
	if (strlen($email) < 6 || strpos($email, '@', 1) === false) return '';
	[$local, $domain] = explode('@', $email, 2);
	$local = preg_replace('/[^a-zA-Z0-9!#$%&\'*+\/=?^_`{|}~\.-]/', '', $local);
	if ('' === $local) return '';
	$domain = preg_replace('/\.{2,}/', '', $domain);
	if ('' === $domain) return '';
	$domain = trim($domain, " \t\n\r\0\x0B.");
	if ('' === $domain) return '';
	$subs = explode('.', $domain);
	if (count($subs) < 2) return '';
	$new = [];
	foreach ($subs as $sub) { $sub = trim($sub, " \t\n\r\0\x0B-"); $sub = preg_replace('/[^a-z0-9-]+/i', '', $sub); if ('' !== $sub) $new[] = $sub; }
	if (count($new) < 2) return '';
	return $local . '@' . implode('.', $new);
}
function sanitize_title($s) { return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', (string) $s), '-')); }
/** esc_url_raw(): WordPress's rules, without the display-only &-encoding. */
function esc_url_raw($url, $protocols = null) {
	$url = str_replace(' ', '%20', ltrim((string) $url));
	$url = preg_replace('|[^a-z0-9-~+_.?#=!&;,/:%@$\|*\'()\[\]\x80-\xff]|i', '', $url);
	if ('' === $url) return $url;
	if (0 !== stripos($url, 'mailto:')) { do { $before = $url; $url = str_replace(['%0d', '%0a', '%0D', '%0A'], '', $url); } while ($before !== $url); }
	$url = str_replace(';//', '://', $url);
	if (strpos($url, ':') === false && !in_array($url[0], ['/', '#', '?'], true) && !preg_match('/^[a-z0-9-]+?\.php/i', $url)) $url = 'http://' . $url;
	if ('/' === $url[0]) return $url;
	$protocols = $protocols ?? ['http', 'https', 'ftp', 'ftps', 'mailto', 'news', 'irc', 'irc6', 'ircs', 'gopher', 'nntp', 'feed', 'telnet', 'mms', 'rtsp', 'sms', 'svn', 'tel', 'fax', 'xmpp', 'webcal', 'urn'];
	// wp_kses_bad_protocol(): a scheme not on the list is stripped, and a changed URL is refused.
	if (preg_match('/^([^:\/?#]+):/', $url, $m) && !in_array(strtolower($m[1]), $protocols, true)) return '';
	return $url;
}
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8', false); }
function esc_attr($s) { return esc_html($s); }
/** esc_url() for display: as esc_url_raw(), then & and ' as entities (WordPress's own last step). */
function esc_url($s) { return str_replace("'", '&#039;', preg_replace('/&(?!#038;)/', '&#038;', str_replace('&amp;', '&', esc_url_raw($s)))); }
function absint($v) { return abs((int) $v); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_mail($to, $subject, $body, $headers = '') { $GLOBALS['MAIL'][] = ['to' => $to, 'subject' => $subject, 'body' => $body, 'headers' => $headers]; return true; }
function wp_salt($s = 'auth') { return 'test-salt'; }
function get_post_type($id) { global $wpdb; return $wpdb->get_var($wpdb->prepare('SELECT post_type FROM svz_posts WHERE ID = %d', $id)) ?: false; }
/** wp_get_attachment_image_url() for a size the image has (what the tests ask for); the original otherwise. */
function wp_get_attachment_image_url($id, $size = 'thumbnail') {
	global $wpdb;
	$file = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM svz_postmeta WHERE post_id = %d AND meta_key = '_wp_attached_file'", $id));
	if (!$file) return false;
	$meta = maybe_unserialize($wpdb->get_var($wpdb->prepare("SELECT meta_value FROM svz_postmeta WHERE post_id = %d AND meta_key = '_wp_attachment_metadata'", $id)));
	$dir = strpos($file, '/') !== false ? substr($file, 0, strrpos($file, '/') + 1) : '';
	$f = isset($meta['sizes'][$size]['file']) ? $dir . $meta['sizes'][$size]['file'] : $file;
	return 'https://gawlakfamilyfarms.com/wp-content/uploads/' . $f;
}
function home_url($p = '/') { return 'https://gawlakfamilyfarms.com/' . ltrim($p, '/'); }
function get_permalink($id = 0) { return home_url($GLOBALS['PERMALINK'] ?? '/'); }
function admin_url($p = '') { return 'https://gawlakfamilyfarms.com/wp-admin/' . $p; }
/** add_query_arg(): WordPress's own algorithm (existing args kept and re-encoded, new values added as given). */
function add_query_arg(...$a) {
	if (is_array($a[0])) { $uri = $a[1] ?? ($_SERVER['REQUEST_URI'] ?? ''); $new = $a[0]; } else { $uri = $a[2] ?? ($_SERVER['REQUEST_URI'] ?? ''); $new = [$a[0] => $a[1]]; }
	$frag = strstr($uri, '#');
	if ($frag) { $uri = substr($uri, 0, -strlen($frag)); } else { $frag = ''; }
	if (0 === stripos($uri, 'http://')) { $protocol = 'http://'; $uri = substr($uri, 7); }
	elseif (0 === stripos($uri, 'https://')) { $protocol = 'https://'; $uri = substr($uri, 8); }
	else { $protocol = ''; }
	if (str_contains($uri, '?')) { [$base, $query] = explode('?', $uri, 2); $base .= '?'; }
	elseif ($protocol || !str_contains($uri, '=')) { $base = $uri . '?'; $query = ''; }
	else { $base = ''; $query = $uri; }
	parse_str($query, $qs);
	array_walk_recursive($qs, function (&$v) { $v = urlencode($v); });
	foreach ($new as $k => $v) $qs[$k] = $v;
	foreach ($qs as $k => $v) if ($v === false) unset($qs[$k]);
	$parts = [];
	foreach ($qs as $k => $v) { if ($v === null) continue; $parts[] = $k . '=' . (is_array($v) ? '' : (string) $v); }
	$ret = trim(implode('&', $parts), '?');
	$ret = preg_replace('#=(&|$)#', '$1', $ret);
	$ret = rtrim($protocol . $base . $ret . $frag, '?');
	return str_replace('?#', '#', $ret);
}
/** A predictable stand-in: R0001R0001…, R0002…; the counter restarts with each request (test/action-php.php). */
function wp_generate_password($len = 12, $special = true, $extra = false) { $GLOBALS['PW_N'] = ($GLOBALS['PW_N'] ?? 0) + 1; return substr(str_repeat(sprintf('R%04d', $GLOBALS['PW_N']), 10), 0, $len); }
function wp_rand($a = 0, $b = 0) { return $a; }
class TestUser {
	public $roles = [];
	/** WP_User's magic properties: anything else (first_name, …) is the user's meta. */
	public function __get($k) { return get_user_meta($this->ID, $k, true); }
	public function __construct($row) { foreach ((array) $row as $k => $v) $this->$k = $v; $caps = get_user_meta($this->ID, 'svz_capabilities'); $this->roles = is_array($caps) ? array_keys(array_filter($caps)) : []; }
	public function add_role($r) { $caps = get_user_meta($this->ID, 'svz_capabilities'); $caps = is_array($caps) ? $caps : []; $caps[$r] = true; update_user_meta($this->ID, 'svz_capabilities', $caps); $this->roles = array_keys(array_filter($caps)); }
	public function remove_role($r) { $caps = get_user_meta($this->ID, 'svz_capabilities'); $caps = is_array($caps) ? $caps : []; unset($caps[$r]); update_user_meta($this->ID, 'svz_capabilities', $caps); $this->roles = array_keys(array_filter($caps)); }
}
function get_userdata($id) {
	global $wpdb;
	$u = $wpdb->get_row($wpdb->prepare('SELECT * FROM svz_users WHERE ID = %d', $id));
	return $u ? new TestUser($u) : false;
}
function get_user_by($f, $v) {
	global $wpdb;
	$col = ['email' => 'user_email', 'login' => 'user_login', 'id' => 'ID'][$f] ?? 'ID';
	$id = $wpdb->get_var($wpdb->prepare("SELECT ID FROM svz_users WHERE $col = %s", $v));
	return $id ? get_userdata($id) : false;
}
/** sanitize_user(): WordPress's rules (remove_accents() is a no-op on the ASCII the plugin passes). */
function sanitize_user($username, $strict = false) {
	$username = strip_tags((string) $username);
	$username = preg_replace('|%([a-fA-F0-9][a-fA-F0-9])|', '', $username);
	$username = preg_replace('/&.+?;/', '', $username);
	if ($strict) $username = preg_replace('|[^a-z0-9 _.\-@]|i', '', $username);
	$username = trim($username);
	return preg_replace('|\s+|', ' ', $username);
}
function username_exists($login) { $u = get_user_by('login', $login); return $u ? (int) $u->ID : false; }
function email_exists($email) { $u = get_user_by('email', $email); return $u ? (int) $u->ID : false; }
/**
 * wp_insert_user() for a new user, as far as the plugin uses it: WordPress's
 * own checks and messages, the role, first/last name. The password is not
 * stored: in the port sign-in is the shared accounts service (MIGRATION.md).
 */
function wp_insert_user($d) {
	global $wpdb;
	$login = trim(sanitize_user($d['user_login'] ?? '', true));
	if ($login === '') return new WP_Error('empty_user_login', 'Cannot create a user with an empty login name.');
	if (mb_strlen($login) > 60) return new WP_Error('user_login_too_long', 'Username may not be longer than 60 characters.');
	if (username_exists($login)) return new WP_Error('existing_user_login', 'Sorry, that username already exists!');
	$email = (string) ($d['user_email'] ?? '');
	if ($email !== '' && email_exists($email)) return new WP_Error('existing_user_email', 'Sorry, that email address is already used!');
	$display = (string) ($d['display_name'] ?? '');
	if ($display === '') $display = $login;
	$wpdb->insert('svz_users', ['user_login' => $login, 'user_pass' => '', 'user_nicename' => sanitize_title(mb_substr($login, 0, 50)), 'user_email' => $email,
		'user_url' => '', 'user_registered' => gmdate('Y-m-d H:i:s', time_now()), 'user_activation_key' => '', 'user_status' => 0, 'display_name' => $display]);
	$id = (int) $wpdb->insert_id;
	update_user_meta($id, 'first_name', (string) ($d['first_name'] ?? ''));
	update_user_meta($id, 'last_name', (string) ($d['last_name'] ?? ''));
	update_user_meta($id, 'svz_capabilities', [($d['role'] ?? 'subscriber') => true]);
	return $id;
}
/** wp_new_user_notification( $id, null, 'admin' ): WordPress's own email to the site admin. */
function wp_new_user_notification($id, $deprecated = null, $notify = '') {
	$u = get_userdata($id);
	if (!$u) return;
	$blogname = htmlspecialchars_decode((string) get_option('blogname'), ENT_QUOTES);
	if ($notify !== 'user') {
		$m = sprintf('New user registration on your site %s:', $blogname) . "\r\n\r\n";
		$m .= sprintf('Username: %s', $u->user_login) . "\r\n\r\n";
		$m .= sprintf('Email: %s', $u->user_email) . "\r\n";
		wp_mail(get_option('admin_email'), sprintf('[%s] New User Registration', $blogname), $m);
	}
}
function get_users($a = []) {
	global $wpdb;
	$order = ['display_name' => 'display_name', 'registered' => 'user_registered'][$a['orderby'] ?? ''] ?? 'user_login';
	$dir = strtoupper($a['order'] ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
	$out = [];
	// Ties (e.g. users registered in the same second) fall back to the id, as the Worker's query does.
	foreach ($wpdb->get_results("SELECT ID FROM svz_users ORDER BY $order $dir, ID ASC") as $r) {
		$u = get_userdata($r->ID);
		if (isset($a['role']) && !in_array($a['role'], $u->roles, true)) continue;
		if (isset($a['role__in']) && !array_intersect($a['role__in'], $u->roles)) continue;
		if (!empty($a['exclude']) && in_array((int) $u->ID, array_map('intval', $a['exclude']), true)) continue;
		if (isset($a['meta_key'])) { $mv = get_user_meta($u->ID, $a['meta_key'], true); if ($mv === '' || (isset($a['meta_value']) && $mv !== $a['meta_value'])) continue; }
		$out[] = ($a['fields'] ?? '') === 'ID' ? $u->ID : $u;
		if (!empty($a['number']) && $a['number'] > 0 && count($out) >= $a['number']) break; // number -1: no limit, as WordPress
	}
	return $out;
}
function maybe_unserialize($v) { if (!is_string($v)) return $v; $u = @unserialize($v); return ($u !== false || $v === 'b:0;') ? $u : $v; }
function get_user_meta($uid, $key, $single = true) {
	global $wpdb;
	$v = $wpdb->get_var($wpdb->prepare('SELECT meta_value FROM svz_usermeta WHERE user_id = %d AND meta_key = %s LIMIT 1', $uid, $key));
	return $v === null ? '' : maybe_unserialize($v);
}
function update_user_meta($uid, $key, $value) {
	global $wpdb;
	$wpdb->query($wpdb->prepare('DELETE FROM svz_usermeta WHERE user_id = %d AND meta_key = %s', $uid, $key));
	$wpdb->query($wpdb->prepare('INSERT INTO svz_usermeta (user_id, meta_key, meta_value) VALUES (%d, %s, %s)', $uid, $key, is_array($value) ? serialize($value) : (string) $value));
	return true;
}
function add_user_meta($uid, $key, $value) { return update_user_meta($uid, $key, $value); }
function delete_user_meta($uid, $key) { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM svz_usermeta WHERE user_id = %d AND meta_key = %s', $uid, $key)); return true; }
function get_option($k, $d = false) {
	global $wpdb;
	$v = $wpdb->get_var($wpdb->prepare('SELECT option_value FROM svz_options WHERE option_name = %s', $k));
	return $v === null ? $d : maybe_unserialize($v);
}
function update_option($k, $v, $autoload = null) {
	global $wpdb;
	$wpdb->query($wpdb->prepare('DELETE FROM svz_options WHERE option_name = %s', $k));
	$wpdb->query($wpdb->prepare("INSERT INTO svz_options (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $k, is_array($v) ? serialize($v) : (string) $v));
	return true;
}
function delete_option($k) { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM svz_options WHERE option_name = %s', $k)); return true; }
/* Transients live in their own table here, as they do in the Worker. */
function set_transient($k, $v, $ttl = 0) {
	global $wpdb;
	$wpdb->query($wpdb->prepare('DELETE FROM test_transients WHERE name = %s', $k));
	$wpdb->query($wpdb->prepare('INSERT INTO test_transients (name, value, expires_at) VALUES (%s, %s, %d)', $k, is_array($v) ? serialize($v) : (string) $v, $ttl ? time_now() + $ttl : 4000000000));
	return true;
}
function get_transient($k) {
	global $wpdb;
	$v = $wpdb->get_var($wpdb->prepare('SELECT value FROM test_transients WHERE name = %s AND expires_at > %d', $k, time_now()));
	return $v === null ? false : maybe_unserialize($v);
}
function delete_transient($k) { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM test_transients WHERE name = %s', $k)); return true; }
function wp_remote_post($url, $args = []) { return http_call($url, 'POST', $args); }
function wp_remote_request($url, $args = []) { return http_call($url, $args['method'] ?? 'GET', $args); }
function wp_remote_get($url, $args = []) { return http_call($url, 'GET', $args); }
/** Only the test's fake chain answers; anything else is refused, as the network is not part of the test. */
function http_call($url, $method, $args) {
	// A body given as an array is form-encoded, as WordPress's HTTP API does.
	if (isset($args['body']) && is_array($args['body'])) { $args['body'] = http_build_query($args['body']); $args['headers']['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
	$GLOBALS['HTTP_LOG'][] = [$method, $url, $args['body'] ?? null];
	// Every outside service is answered by the test's fake server, under its own path.
	$url = str_replace(TEST_HOSTS, array_map(fn($p) => $GLOBALS['RPC'] . $p, array_values(TEST_HOST_PATHS)), $url);
	if ($GLOBALS['RPC'] === '' || strpos($url, $GLOBALS['RPC']) !== 0) return new WP_Error('net', 'no network in tests');
	$ch = curl_init($url);
	curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_POSTFIELDS => $args['body'] ?? null,
		CURLOPT_HTTPHEADER => test_http_headers($args['headers'] ?? [])]);
	$body = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
	return ['body' => (string) $body, 'response' => ['code' => $code]];
}
/** The request's headers as given (a JSON content type when none is). */
function test_http_headers($h) {
	$out = array_map(fn($k, $v) => "$k: $v", array_keys($h), array_values($h));
	if (!array_filter(array_keys($h), fn($k) => strtolower($k) === 'content-type')) $out[] = 'content-type: application/json';
	return $out;
}
class WP_Error { public function __construct(public $code = '', public $message = '') {} public function get_error_message() { return $this->message; } }
function is_wp_error($v) { return $v instanceof WP_Error; }
function wp_remote_retrieve_body($r) { return is_array($r) ? $r['body'] : ''; }
function wp_remote_retrieve_response_code($r) { return is_array($r) ? $r['response']['code'] : 0; }
/** do_action(): the hook's callbacks, in priority order (they print straight to the page). */
function do_action($h, ...$a) { echo run_hook($h, ...$a); }
function get_role($r) { return true; }
function add_role(...$a) { return true; }

function wp_schedule_single_event(...$a) { return true; }
/** wp_next_scheduled(): the hook's next time in the site's own WP-Cron table (the cron option). */
function wp_next_scheduled($hook, $args = []) {
	$cron = get_option('cron', []);
	if (!is_array($cron)) return false;
	foreach ($cron as $ts => $hooks) if (is_array($hooks) && isset($hooks[$hook])) return (int) $ts;
	return false;
}
/** wp_timezone() / wp_date(): the site's timezone (timezone_string, else the gmt_offset as ±HH:MM). */
function wp_timezone() {
	$tz = (string) get_option('timezone_string', '');
	if ($tz !== '') return new DateTimeZone($tz);
	$off = (float) get_option('gmt_offset', 0);
	$h = (int) $off; $m = (int) round(abs($off - $h) * 60);
	return new DateTimeZone(sprintf('%s%02d:%02d', $off < 0 ? '-' : '+', abs($h), $m));
}
function wp_date($format, $ts = null) { return (new DateTime('@' . ($ts ?? time_now())))->setTimezone(wp_timezone())->format($format); }
/** add_settings_error(): recorded (the options.php stand-in keeps a setting's old value when its sanitizer refuses). */
function add_settings_error($setting, $code, $message, $type = 'error') { $GLOBALS['SETTINGS_ERRORS'][] = [$setting, $code, $message, $type]; }
function esc_sql($s) { global $wpdb; return $wpdb->db->real_escape_string((string) $s); }


/** Outside services, each answered by the test's fake server under a path of its own. */
const TEST_HOST_PATHS = [
	'https://maps.googleapis.com' => '/geocode',
	'https://nominatim.openstreetmap.org' => '/nominatim',
	'https://router.project-osrm.org' => '/osrm',
	'https://oauth2.googleapis.com' => '/google-oauth',
	'https://sheets.googleapis.com' => '/sheets',
	'https://geocoding.geo.census.gov' => '/census',
	'https://planetarycomputer.microsoft.com' => '/pc',
];
define('TEST_HOSTS', array_keys(TEST_HOST_PATHS));

/* ---- Hooks, shortcodes and scripts: recorded so a test can run them ---- */
$GLOBALS['HOOKS'] = []; $GLOBALS['SHORTCODES'] = []; $GLOBALS['SCRIPTS'] = []; $GLOBALS['STYLES'] = []; $GLOBALS['INLINE_STYLES'] = []; $GLOBALS['INLINE_SCRIPTS'] = [];
function add_action($h, $cb, $prio = 10, $n = 1) { $GLOBALS['HOOKS'][$h][$prio][] = $cb; return true; }
function add_filter($h, $cb, $prio = 10, $n = 1) { return add_action($h, $cb, $prio, $n); }
/** Run a hook's callbacks in priority order, returning what they echoed. */
function run_hook($h, ...$args) {
	$hooks = $GLOBALS['HOOKS'][$h] ?? [];
	ksort($hooks);
	ob_start();
	foreach ($hooks as $cbs) foreach ($cbs as $cb) $cb(...$args);
	return ob_get_clean();
}
function apply_filters($h, $v, ...$args) {
	$hooks = $GLOBALS['HOOKS'][$h] ?? [];
	ksort($hooks);
	foreach ($hooks as $cbs) foreach ($cbs as $cb) $v = $cb($v, ...$args);
	return $v;
}
function add_shortcode($tag, $cb) { $GLOBALS['SHORTCODES'][$tag] = $cb; }
function shortcode_atts($pairs, $atts, $sc = '') { $atts = (array) $atts; $out = []; foreach ($pairs as $k => $d) $out[$k] = array_key_exists($k, $atts) ? $atts[$k] : $d; return $out; }
function do_shortcode($content) {
	return preg_replace_callback('/\[([a-z_]+)([^\]]*)\]/', function ($m) {
		if (!isset($GLOBALS['SHORTCODES'][$m[1]])) return $m[0];
		preg_match_all('/(\w+)="([^"]*)"/', $m[2], $a, PREG_SET_ORDER);
		$atts = []; foreach ($a as $x) $atts[$x[1]] = $x[2];
		return $GLOBALS['SHORTCODES'][$m[1]]($atts ?: '');
	}, $content);
}
function register_activation_hook($f, $cb) {}
function register_deactivation_hook($f, $cb) {}
/** plugin_dir_url(): a plugin folder's own URL (the single-file plugins under test run from a temporary copy). */
function plugin_dir_url($f) { $d = basename(dirname($f)); return 'https://gawlakfamilyfarms.com/wp-content/plugins/' . ($d === basename(sys_get_temp_dir()) ? 'gff-customer-registration' : $d) . '/'; }
function plugin_dir_path($f) { return dirname($f) . '/'; }
/* Scripts and styles: registered ones are enqueued by handle with their registered source and version, as WordPress does. */
function wp_register_script($h, $src = '', $deps = [], $ver = false, $foot = false) { $GLOBALS['REG_SCRIPTS'][$h] = ['src' => $src, 'ver' => $ver]; return true; }
function wp_enqueue_script($h, $src = '', $deps = [], $ver = false, $foot = false) { $GLOBALS['SCRIPTS'][$h] = ($src === '' && isset($GLOBALS['REG_SCRIPTS'][$h])) ? $GLOBALS['REG_SCRIPTS'][$h] : ['src' => $src, 'ver' => $ver]; }
function wp_add_inline_script($h, $js, $pos = 'after') { $GLOBALS['INLINE_SCRIPTS'][$h][] = $js; return true; }
function wp_register_style($h, $src = '', $deps = [], $ver = false) { $GLOBALS['REG_STYLES'][$h] = ['src' => $src, 'ver' => $ver]; return true; }
function wp_enqueue_style($h, $src = '', $deps = [], $ver = false) { $GLOBALS['STYLES'][$h] = ($src === '' && isset($GLOBALS['REG_STYLES'][$h])) ? $GLOBALS['REG_STYLES'][$h] : ['src' => $src, 'ver' => $ver]; }
function wp_add_inline_style($h, $css) { $GLOBALS['INLINE_STYLES'][$h][] = $css; return true; }
function wp_localize_script($h, $name, $data) { $GLOBALS['LOCALIZED'][$h][$name] = $data; return true; }
function wp_schedule_event(...$a) { return true; }
function wp_clear_scheduled_hook(...$a) { return 0; }
function add_option($k, $v = '', $d = '', $autoload = 'yes') { if (get_option($k, null) === null) update_option($k, $v); return true; }
function add_options_page(...$a) { return 'settings_page_gff'; }
function check_admin_referer(...$a) { return 1; }
function checked($a, $b = true, $echo = true) { $r = (string) $a === (string) $b ? " checked='checked'" : ''; if ($echo) echo $r; return $r; }
function selected($a, $b = true, $echo = true) { $r = (string) $a === (string) $b ? " selected='selected'" : ''; if ($echo) echo $r; return $r; }
function count_users() { global $wpdb; return ['total_users' => (int) $wpdb->get_var('SELECT COUNT(*) FROM svz_users')]; }
function dbDelta($q) { return []; }
function get_bloginfo($k = 'name') { return ['name' => get_option('blogname'), 'description' => get_option('blogdescription'), 'url' => home_url('/'), 'wpurl' => home_url('/'), 'admin_email' => get_option('admin_email'), 'charset' => 'UTF-8'][$k] ?? ''; }
function get_site_icon_url($size = 512, $url = '') { return 'https://gawlakfamilyfarms.com/wp-content/uploads/2026/07/cropped-dodnewsquare-' . $size . 'x' . $size . '.png'; }
function is_admin() { return false; }
function is_page($p = '') { return !empty($GLOBALS['IS_PAGE']); }
function make_clickable($t) { return preg_replace('#(?<![">])(https?://[^\s<]+)#i', '<a href="$1" rel="nofollow">$1</a>', $t); }
function nocache_headers() {}
final class TestExit extends Exception {}
/** header(): recorded (test/action-php.php reports them for a streamed reply). */
function gff_test_header($h) { $GLOBALS['HEADERS'][] = $h; }
/** wp_get_referer(): the posted _wp_http_referer or the Referer header, unless it is this request or another site's. */
function wp_get_referer() {
	$ref = !empty($_REQUEST['_wp_http_referer']) ? $_REQUEST['_wp_http_referer'] : ($_SERVER['HTTP_REFERER'] ?? '');
	if (!$ref || $ref === ($_SERVER['REQUEST_URI'] ?? '') || $ref === home_url($_SERVER['REQUEST_URI'] ?? '')) return false;
	$host = parse_url($ref, PHP_URL_HOST);
	return ($host === null || $host === 'gawlakfamilyfarms.com') ? $ref : false;
}
/** human_time_diff(): WordPress's rounding and wording. */
function human_time_diff($from, $to = 0) {
	if (empty($to)) $to = time_now();
	$diff = (int) abs($to - $from);
	if ($diff < 3600) { $m = (int) round($diff / 60); if ($m <= 1) $m = 1; return $m === 1 ? "$m min" : "$m mins"; }
	if ($diff < 86400) { $h = (int) round($diff / 3600); if ($h <= 1) $h = 1; return $h === 1 ? "$h hour" : "$h hours"; }
	if ($diff < 604800) { $d = (int) round($diff / 86400); if ($d <= 1) $d = 1; return $d === 1 ? "$d day" : "$d days"; }
	if ($diff < 2592000) { $w = (int) round($diff / 604800); if ($w <= 1) $w = 1; return $w === 1 ? "$w week" : "$w weeks"; }
	if ($diff < 31536000) { $mo = (int) round($diff / 2592000); if ($mo <= 1) $mo = 1; return $mo === 1 ? "$mo month" : "$mo months"; }
	$y = (int) round($diff / 31536000); if ($y <= 1) $y = 1; return $y === 1 ? "$y year" : "$y years";
}
/** date_i18n( $f, $ts ): the literal local time, formatted (English). */
function date_i18n($format, $ts = false, $gmt = false) { return gmdate($format, $ts === false ? current_time('timestamp', $gmt) : (int) $ts); }
function wp_hash($data, $scheme = 'auth') { return hash_hmac('md5', $data, wp_salt($scheme)); }
function wp_strip_all_tags($t) { $t = preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $t); return trim(strip_tags($t)); }
function wp_trim_words($text, $num = 55, $more = null) {
	$more ??= '&hellip;';
	$w = preg_split("/[\n\r\t ]+/", wp_strip_all_tags($text), $num + 1, PREG_SPLIT_NO_EMPTY);
	if (count($w) > $num) { array_pop($w); return implode(' ', $w) . $more; }
	return implode(' ', $w);
}
/** wp_delete_user(): the user and their meta (they own no posts here). */
function wp_delete_user($id) { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM svz_usermeta WHERE user_id = %d', $id)); $wpdb->query($wpdb->prepare('DELETE FROM svz_users WHERE ID = %d', $id)); return true; }
function get_edit_user_link($id) { return (int) $id === get_current_user_id() ? admin_url('profile.php') : admin_url('user-edit.php?user_id=' . (int) $id); }
function wp_nonce_url($url, $action = -1, $name = '_wpnonce') { return esc_html(add_query_arg($name, wp_create_nonce($action), str_replace('&amp;', '&', $url))); }
function settings_fields($group) { echo "<input type='hidden' name='option_page' value='" . esc_attr($group) . "' />"; echo '<input type="hidden" name="action" value="update" />'; wp_nonce_field("$group-options"); }
/** register_setting(): recorded, for the options.php stand-in in test/action-php.php (@options). */
function register_setting($group, $name, $args = []) { $GLOBALS['SETTINGS'][$group][$name] = $args; }
function submit_button($text = null, $type = 'primary', $name = 'submit') { echo '<p class="submit"><input type="submit" name="' . esc_attr($name) . '" id="' . esc_attr($name) . '" class="button button-' . $type . '" value="' . esc_attr($text ?? 'Save Changes') . '"  /></p>'; }
function user_can($u, $cap, ...$args) {
	$u = is_object($u) ? $u : get_userdata($u);
	if (!$u) return false;
	if ($cap === 'edit_user' && isset($args[0]) && (int) $args[0] === (int) $u->ID) return true; // map_meta_cap: editing oneself
	if ($cap === 'edit_user') $cap = 'edit_users';
	static $roles = null;
	$roles ??= maybe_unserialize($GLOBALS['wpdb']->get_var("SELECT option_value FROM svz_options WHERE option_name = 'svz_user_roles'"));
	foreach ($u->roles as $r) if (!empty($roles[$r]['capabilities'][$cap])) return true;
	return false;
}
function wc_get_page_permalink($p) { return home_url($p === 'myaccount' ? '/account/' : '/' . $p . '/'); }
function wp_create_nonce($a = -1) { return 'nonce-' . $a; }
function wp_verify_nonce($n, $a = -1) { return 1; }
/** wp_nonce_field() and wp_referer_field(), as WordPress prints them (the referer is the request's own path). */
function wp_nonce_field($a = -1, $name = '_wpnonce', $ref = true, $echo = true) {
	$name = esc_attr($name);
	$r = '<input type="hidden" id="' . $name . '" name="' . $name . '" value="' . wp_create_nonce($a) . '" />';
	if ($ref) $r .= wp_referer_field(false);
	if ($echo) echo $r;
	return $r;
}
function wp_referer_field($echo = true) {
	$r = '<input type="hidden" name="_wp_http_referer" value="' . esc_url(remove_query_arg('_wp_http_referer')) . '" />';
	if ($echo) echo $r;
	return $r;
}
if (!function_exists('remove_query_arg')) {
	function remove_query_arg($key, $query = false) {
		$query = $query === false ? ($_SERVER['REQUEST_URI'] ?? '') : $query;
		foreach ((array) $key as $k) $query = add_query_arg($k, false, $query);
		return $query;
	}
}
function wp_die($m = '', $t = '', $a = []) { throw new JsonReply(['die' => is_string($m) ? $m : '']); }
function wp_kses_post($s) { return $s; }
/** The Worker's sign-in: the shared accounts service, back to the same page (path, query and fragment). */
function wp_login_url($redirect = '') {
	if ($redirect === '') return '/auth/login';
	$p = parse_url($redirect);
	return '/auth/login?returnTo=' . rawurlencode(($p['path'] ?? '/') . (isset($p['query']) ? '?' . $p['query'] : '') . (isset($p['fragment']) ? '#' . $p['fragment'] : ''));
}
function wp_logout_url($redirect = '') { return '/auth/logout'; }
function wp_safe_redirect($to, $status = 302) { throw new JsonReply(['redirect' => $to]); }
function wp_get_attachment_url($id) { return false; }
function wp_upload_dir() { return ['basedir' => sys_get_temp_dir() . '/gff-uploads', 'baseurl' => 'https://gawlakfamilyfarms.com/wp-content/uploads', 'path' => sys_get_temp_dir() . '/gff-uploads', 'url' => 'https://gawlakfamilyfarms.com/wp-content/uploads', 'error' => false]; }
function wp_mkdir_p($d) { return is_dir($d) || mkdir($d, 0777, true); }
function wp_upload_bits($name, $dep, $bits) { $d = wp_upload_dir(); wp_mkdir_p($d['path']); file_put_contents($d['path'] . '/' . $name, $bits); return ['file' => $d['path'] . '/' . $name, 'url' => $d['url'] . '/' . $name, 'error' => false]; }
function wp_handle_upload($file, $o = []) { return ['error' => 'uploads are not part of this test']; }
function wp_check_filetype_and_ext($file, $name) { return ['ext' => pathinfo($name, PATHINFO_EXTENSION), 'type' => mime_content_type($file), 'proper_filename' => false]; }
function media_sideload_image(...$a) { return new WP_Error('net', 'no network in tests'); }

/** Load the whole plugin, with time() (and DateTime 'now') pinned to the test clock. */
define('PLUGIN_FILE', __DIR__ . '/../../../imports/siteground/gawlakfamilyfarms.com/wp-content/plugins/gff-customer-registration/gff-customer-registration.php');
/** The other plugins the site runs, loaded after the main one with the same rewrites. */
define('EXTRA_PLUGIN_FILES', [__DIR__ . '/../../../imports/siteground/gawlakfamilyfarms.com/wp-content/plugins/gff-drive-backup/gff-drive-backup.php']);
function load_plugin(): void {
	foreach (array_merge([PLUGIN_FILE], EXTRA_PLUGIN_FILES) as $i => $file) load_plugin_file($file, $i);
	load_at_plugin();
}
function load_plugin_file(string $file, int $i): void {
	$src = file_get_contents($file);
	// A random id suffix (md5( uniqid() )) becomes a per-request counter, as the Worker's.
	$src = str_replace("md5( uniqid( '', true ) )", "md5( test_uniqid() )", $src);
	// "now" in the site's timezone, at the test clock.
	$src = str_replace("new DateTime( 'now', \$tz )", "(new DateTime( '@' . time_now() ))->setTimezone( \$tz )", $src);
	$src = preg_replace("/\bgmdate\(\s*('[^']*')\s*\)/", 'gmdate($1, time_now())', $src);
	$src = preg_replace('/(?<![\w>$])time\(\)/', 'time_now()', $src);
	// A handler that streams a file (the CSV exports) ends in exit: let the test see its headers and output instead.
	$src = preg_replace('/(?<![\w>$])header\(/', 'gff_test_header(', $src);
	$src = preg_replace('/(?<![\w>$])exit;/', 'throw new TestExit();', $src);
	$tmp = sys_get_temp_dir() . ($i ? '/gff-under-test-' . basename($file) : '/gff-under-test.php');
	file_put_contents($tmp, $src);
	require $tmp;
}
function test_uniqid() { static $n = 0; return 'uniq-' . ++$n; }
function shortcode_exists($tag) { return isset($GLOBALS['SHORTCODES'][$tag]); }
/** mysql2date( $format, $date ): a stored site-time date, formatted as it reads (false for none, as WordPress). */
if (!function_exists('mysql2date')) { function mysql2date($format, $date, $translate = true) { if (empty($date)) return false; $t = strtotime($date . ' UTC'); return $t === false ? false : gmdate($format, $t); } }
function esc_textarea($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function esc_js($s) { return str_replace(["\r", "\n"], ['', '\\n'], addslashes(htmlspecialchars((string) $s, ENT_COMPAT, 'UTF-8', false))); }
function esc_html__($s, $d = '') { return esc_html($s); }
function __($s, $d = '') { return $s; }

/* ---- Aerial Timelapse (a plugin of several files): loaded from a pinned copy of its folder ---- */
define('AT_PLUGIN_SRC', __DIR__ . '/../../../imports/siteground/gawlakfamilyfarms.com/wp-content/plugins/aerial-timelapse');
function load_at_plugin(): void {
	$dst = sys_get_temp_dir() . '/at-under-test/aerial-timelapse';
	foreach (['', '/includes'] as $sub) {
		@mkdir($dst . $sub, 0777, true);
		foreach (glob(AT_PLUGIN_SRC . $sub . '/*.php') as $f) {
			$src = file_get_contents($f);
			$src = preg_replace("/\bgmdate\(\s*('[^']*')\s*\)/", 'gmdate($1, time_now())', $src);
			$src = preg_replace('/(?<![\w>$:])time\(\)/', 'time_now()', $src);
			file_put_contents($dst . $sub . '/' . basename($f), $src);
		}
	}
	require $dst . '/aerial-timelapse.php';
}
/** WP_User for the plugin's type hints: the stand-in's user, re-read (new WP_User( get_userdata( $id ) )). */
if (!class_exists('WP_User')) { class WP_User extends TestUser { public function __construct($row) { parent::__construct($row); $this->ID = (int) $this->ID; } } } // WordPress keeps ID an int
/** rest_url( $path ) */
function rest_url($path = '') { return home_url('/wp-json/' . ltrim($path, '/')); }
function wp_get_upload_dir() { return wp_upload_dir(); }
function trailingslashit($s) { return rtrim($s, '/\\') . '/'; }
function wp_list_pluck($list, $field) { return array_map(fn($x) => is_array($x) ? $x[$field] : $x->$field, $list); }
function sanitize_file_name($n) { return preg_replace('/[^A-Za-z0-9._-]+/', '-', (string) $n); }

/* ---- The REST API, as far as the plugins use it: routes, argument checks, permissions, WordPress's error shapes ---- */
class WP_REST_Response { public function __construct(public $data = null, public $status = 200) {} }
class WP_REST_Request implements ArrayAccess {
	public function __construct(public string $method, public array $params, public array $headers) {}
	public function get_param($k) { return $this->params[$k] ?? null; }
	public function get_header($k) { foreach ($this->headers as $h => $v) if (strtolower($h) === strtolower($k)) return $v; return null; }
	public function offsetExists($k): bool { return isset($this->params[$k]); }
	public function offsetGet($k): mixed { return $this->params[$k] ?? null; }
	public function offsetSet($k, $v): void { $this->params[$k] = $v; }
	public function offsetUnset($k): void { unset($this->params[$k]); }
}
$GLOBALS['REST_ROUTES'] = [];
function register_rest_route($ns, $route, $args = [], $override = false) {
	$eps = isset($args['methods']) || isset($args['callback']) ? [$args] : $args;
	foreach ($eps as $ep) $GLOBALS['REST_ROUTES']['/' . trim($ns, '/') . $route][] = $ep;
	return true;
}
function rest_error($code, $message, $data) { return ['status' => $data['status'], 'data' => ['code' => $code, 'message' => $message, 'data' => $data]]; }
/** WP_REST_Server::dispatch() for one request: route + method, required and typed arguments, sanitizing, permission, callback. */
function test_rest_dispatch(string $method, string $route, array $params, array $headers): array {
	static $inited = false;
	if (!$inited) { run_hook('rest_api_init'); $inited = true; }
	$endpoint = null;
	foreach ($GLOBALS['REST_ROUTES'][$route] ?? [] as $ep) {
		$ms = array_map('strtoupper', is_array($ep['methods']) ? $ep['methods'] : explode(',', (string) $ep['methods']));
		if (in_array($method, $ms, true)) { $endpoint = $ep; break; }
	}
	if (!$endpoint) return rest_error('rest_no_route', 'No route was found matching the URL and request method.', ['status' => 404]);
	$args = $endpoint['args'] ?? [];
	$missing = [];
	foreach ($args as $k => $a) if (!empty($a['required']) && !isset($params[$k])) $missing[] = $k;
	if ($missing) return rest_error('rest_missing_callback_param', sprintf('Missing parameter(s): %s', implode(', ', $missing)), ['status' => 400, 'params' => $missing]);
	$invalid = []; $details = [];
	foreach ($args as $k => $a) {
		if (!isset($params[$k]) || empty($a['type'])) continue;
		$v = $params[$k];
		$ok = $a['type'] === 'integer' ? (is_numeric($v) && round((float) $v) === (float) $v) : ($a['type'] === 'string' ? is_string($v) : true);
		if (!$ok) { $msg = sprintf('%1$s is not of type %2$s.', $k, $a['type']); $invalid[$k] = $msg; $details[$k] = ['code' => 'rest_invalid_type', 'message' => $msg, 'data' => ['param' => $k]]; }
	}
	if ($invalid) return rest_error('rest_invalid_param', sprintf('Invalid parameter(s): %s', implode(', ', array_keys($invalid))), ['status' => 400, 'params' => $invalid, 'details' => $details]);
	foreach ($args as $k => $a) {
		if (!isset($params[$k])) continue;
		if (!empty($a['sanitize_callback'])) $params[$k] = call_user_func($a['sanitize_callback'], $params[$k]);
		elseif (($a['type'] ?? '') === 'integer') $params[$k] = (int) $params[$k];
	}
	$request = new WP_REST_Request($method, $params, $headers);
	$perm = isset($endpoint['permission_callback']) ? call_user_func($endpoint['permission_callback'], $request) : true;
	if (!$perm) return rest_error('rest_forbidden', 'Sorry, you are not allowed to do that.', ['status' => is_user_logged_in() ? 403 : 401]);
	$r = call_user_func($endpoint['callback'], $request);
	if ($r instanceof WP_REST_Response) return ['status' => $r->status, 'data' => $r->data];
	if (is_wp_error($r)) return rest_error($r->code, $r->message, ['status' => 500]);
	return ['status' => 200, 'data' => $r];
}
