<?php
/**
 * The PHP half of test/actions.parity.ts: replay requests through the
 * plugin's own handlers on fppm_fixture, and after each one record the reply,
 * the mail sent, the sign-in calls and the stored state (users and roles,
 * fppm_* user meta with first/last name, fppm_* and gff_dbk_* settings,
 * transients). Reads {now, rpc, steps:[…]}; everything is rolled back at the
 * end so every run starts from the same fixture.
 *
 * Step kinds (the action field):
 *   <name>          admin-ajax.php: wp_ajax_<name> / wp_ajax_nopriv_<name>
 *   @page           a page posting the join form to itself (fppm_maybe_handle_register on
 *                   template_redirect); the reply is the error and the refill values, or the redirect
 *   @post:<name>    admin-post.php: admin_post_<name> / admin_post_nopriv_<name>
 *   @option         set settings first (post = name => value; JSON for arrays)
 *   @meta           set the step user's meta first (post = key => value)
 *   @job:<hook>     run a WP-Cron hook now
 *   @admin:<screen> an admin screen as the step's user (the reply is its HTML):
 *                   settings, waivers, drive (POST fields run "Run backup now")
 *   @options        a settings form posted to options.php (post.option_page names the group)
 * A step's referer (the page the form was on) becomes the Referer header; ua the User-Agent.
 */
$IN = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['NOW'] = (int) $IN['now'];
$GLOBALS['RPC'] = $IN['rpc'] ?? '';
$_SERVER['REMOTE_ADDR'] = '203.0.113.50';
require __DIR__ . '/wp.php';
$wpdb = $GLOBALS['wpdb'];
$wpdb->query('CREATE TABLE IF NOT EXISTS test_transients (name VARCHAR(191) PRIMARY KEY, value LONGTEXT, expires_at BIGINT)');
$wpdb->query('DELETE FROM test_transients');
// Rolled-back inserts still use up InnoDB ids: reset the counter (to max + 1, as SQLite continues) before the run.
$wpdb->query('ALTER TABLE bxb_users AUTO_INCREMENT = 1');
$wpdb->db->begin_transaction();
load_plugin();
run_hook('init');

/** Settings an @option step sets as arrays (everything else is text, JSON-looking or not). */
const ARRAY_OPTIONS = ['fppm_events', 'fppm_announcements', 'fppm_coupon_codes', 'fppm_apparel_extra'];
/** Credentials: not part of the comparison (the Worker keeps them as secrets). */
const SKIP_OPTIONS = ['fppm_gs_json', 'fppm_pp_secret', 'fppm_printful_token', 'gff_dbk_sa_json'];

/** A stored value as [kind, text]: arrays as JSON (the events' RSVPs as [uid, status] pairs, in order), the rest as text. */
function kv($name, $v) {
	$v = maybe_unserialize($v);
	if (!is_array($v)) return ['s', (string) $v];
	if ($name === 'fppm_events') foreach ($v as &$e) if (is_array($e) && isset($e['rsvps']) && is_array($e['rsvps'])) { $p = []; foreach ($e['rsvps'] as $k => $s) $p[] = [(int) $k, $s]; $e['rsvps'] = $p; }
	return ['a', json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)];
}
function snapshot(): array {
	global $wpdb;
	$out = [];
	$out['users'] = array_map(fn($r) => [(string) $r->ID, $r->user_login, $r->user_email, $r->display_name, $r->user_registered, json_encode(roles_of_user($r->ID))],
		$wpdb->get_results('SELECT ID, user_login, user_email, display_name, user_registered FROM bxb_users ORDER BY ID'));
	$out['usermeta'] = array_map(fn($r) => [(string) $r->user_id, $r->meta_key, kv($r->meta_key, $r->meta_value)],
		$wpdb->get_results("SELECT user_id, meta_key, meta_value FROM bxb_usermeta WHERE meta_key LIKE 'fppm\\_%' OR meta_key IN ('first_name', 'last_name') ORDER BY user_id, meta_key"));
	$out['options'] = array_values(array_filter(array_map(fn($r) => [$r->option_name, kv($r->option_name, $r->option_value)],
		$wpdb->get_results("SELECT option_name, option_value FROM bxb_options WHERE option_name LIKE 'fppm\\_%' OR option_name LIKE 'gff\\_dbk\\_%' ORDER BY option_name")),
		fn($o) => !in_array($o[0], SKIP_OPTIONS, true)));
	$out['transients'] = array_values(array_map(fn($r) => [$r->name, kv($r->name, $r->value)],
		$wpdb->get_results("SELECT name, value FROM test_transients ORDER BY name")));
	return $out;
}

$results = [];
foreach ($IN['steps'] as $s) {
	$GLOBALS['UID'] = (int) $s['uid'];
	$_POST = $s['post'] ?? [];
	$_GET = $s['get'] ?? [];
	$_REQUEST = $_POST + $_GET;
	$_FILES = [];
	$GLOBALS['MAIL'] = [];
	$GLOBALS['AUTH'] = [];
	unset($GLOBALS['fppm_reg_err'], $GLOBALS['fppm_reg_old']);
	$GLOBALS['HEADERS'] = [];
	$_SERVER['HTTP_REFERER'] = $s['referer'] ?? '';
	$_SERVER['HTTP_USER_AGENT'] = $s['ua'] ?? '';
	$_SERVER['REQUEST_URI'] = str_starts_with($s['action'], '@post:') ? '/wp-admin/admin-post.php' : '/';
	$a = $s['action'];
	$reply = null;
	$run = function ($hook) {
		$cbs = $GLOBALS['HOOKS'][$hook] ?? [];
		ksort($cbs);
		if (!$cbs) return null;
		try { foreach ($cbs as $list) foreach ($list as $cb) $cb(); return ['die' => '']; }
		catch (JsonReply $r) { return $r->body; }
	};
	ob_start();
	try {
		if ($a === '@option') {
			foreach ($_POST as $k => $v) update_option($k, in_array($k, ARRAY_OPTIONS, true) ? json_decode($v, true) : $v);
			$reply = ['die' => ''];
		} elseif (str_starts_with($a, '@meta')) {
			foreach ($_POST as $k => $v) update_user_meta($GLOBALS['UID'], $k, is_string($v) && preg_match('/^[\[{]/', $v) ? json_decode($v, true) : $v);
			$reply = ['die' => ''];
		} elseif (str_starts_with($a, '@job:')) {
			run_hook(substr($a, 5));
			$reply = ['die' => ''];
		} elseif ($a === '@page') {
			$_SERVER['REQUEST_URI'] = '/go/';
			try { fppm_maybe_handle_register(); $reply = ['err' => $GLOBALS['fppm_reg_err'] ?? '', 'old' => ($GLOBALS['fppm_reg_old'] ?? []) ?: new stdClass()]; }
			catch (JsonReply $r) { $reply = ['exit' => $r->body]; }
		} elseif (str_starts_with($a, '@post:')) {
			try { $reply = $run(($GLOBALS['UID'] ? 'admin_post_' : 'admin_post_nopriv_') . substr($a, 6)) ?? ['die' => '']; }
			catch (TestExit $e) { $reply = ['exit' => true, 'headers' => $GLOBALS['HEADERS'], 'body' => ob_get_contents()]; }
		} elseif ($a === '@options') {
			$_SERVER['REQUEST_URI'] = '/wp-admin/options.php';
			run_hook('admin_init');
			$group = $_POST['option_page'] ?? '';
			if (!current_user_can('manage_options')) wp_die('Sorry, you are not allowed to manage options for this site.');
			if (!isset($GLOBALS['SETTINGS'][$group])) wp_die('<strong>Error:</strong> The options page was not found in the allowed options list.');
			foreach ($GLOBALS['SETTINGS'][$group] as $name => $args) {
				$v = isset($_POST[$name]) ? (is_array($_POST[$name]) ? $_POST[$name] : trim($_POST[$name])) : null;
				update_option($name, isset($args['sanitize_callback']) ? call_user_func($args['sanitize_callback'], $v) : $v);
			}
			wp_safe_redirect(add_query_arg('settings-updated', 'true', wp_get_referer() ?: '/wp-admin/options.php'));
		} elseif (str_starts_with($a, '@admin:')) {
			$screen = substr($a, 7);
			$uri = ['settings' => '/wp-admin/admin.php?page=fppm-settings', 'waivers' => '/wp-admin/admin.php?page=fppm-waivers', 'drive' => '/wp-admin/tools.php?page=gff-drive-backup'][$screen];
			$_SERVER['REQUEST_URI'] = $_GET ? $uri . '&' . http_build_query($_GET) : $uri;
			if ($screen === 'settings') fppm_settings_page();
			elseif ($screen === 'waivers') fppm_waivers_page();
			elseif ($screen === 'drive') gff_dbk_settings_page();
			$reply = ['html' => ob_get_contents()];
		} else {
			$reply = $run(($GLOBALS['UID'] ? 'wp_ajax_' : 'wp_ajax_nopriv_') . $a) ?? ['die' => '0']; // admin-ajax.php with no handler answers "0"
		}
	} catch (JsonReply $r) { $reply = $r->body; }
	ob_end_clean();
	$results[] = ['reply' => $reply, 'mail' => $GLOBALS['MAIL'], 'auth' => $GLOBALS['AUTH'], 'state' => snapshot()];
}
$wpdb->db->rollback();
echo json_encode(['results' => $results, 'http' => $GLOBALS['HTTP_LOG'] ?? []], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
