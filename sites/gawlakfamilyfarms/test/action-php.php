<?php
/**
 * The PHP half of test/actions.parity.ts: replay requests through the
 * plugin's own handlers on gff_fixture, and after each one record the reply,
 * the mail sent, and the stored state (users and roles, gff_* user meta with
 * first/last name, gff_* settings, transients). Reads {now, rpc, steps:[…]};
 * everything is rolled back at the end so every run starts from the same
 * fixture.
 *
 * Step kinds (the action field):
 *   <name>          admin-ajax.php: wp_ajax_<name> / wp_ajax_nopriv_<name>
 *   @page           a page posting its sign-up form to itself: the 'wp' hook
 *                   (gff_reg_maybe_handle_submit); the reply is the notice and
 *                   the values kept to refill the form
 *   @post:<name>    admin-post.php: admin_post_<name> / admin_post_nopriv_<name>;
 *                   the reply is where it redirects (wp_safe_redirect + exit)
 *   @option         set settings first (post = name => value; JSON for arrays)
 *   @meta           set the step user's meta first (post = key => value)
 *   @job:<hook>     run a WP-Cron hook now
 *   @admin:<screen> an admin screen, as the step's user (the reply is its HTML):
 *                   clients (GFF Clients), settings (GFF Settings), dashboard
 *                   (gff_admin_dashboard, the account page's staff view),
 *                   profile:<uid> (the plugin's panels on that user's profile),
 *                   save:<uid> (that profile saved: the plugin's update hooks),
 *                   drive (GFF Drive Backup's settings page, with its Run now button)
 *   @options        the GFF Settings form posted to options.php
 *
 * A step's referer (the page the form was on) becomes the Referer header. A
 * streamed reply (the CSV exports) is reported as its headers and output.
 */
$IN = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['NOW'] = (int) $IN['now'];
$GLOBALS['RPC'] = $IN['rpc'] ?? '';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require __DIR__ . '/wp.php';
$wpdb = $GLOBALS['wpdb'];
$wpdb->query('CREATE TABLE IF NOT EXISTS test_transients (name VARCHAR(191) PRIMARY KEY, value LONGTEXT, expires_at BIGINT)');
$wpdb->query('DELETE FROM test_transients');
// Rolled-back inserts still use up InnoDB ids: reset the counter (to max + 1, as SQLite continues) before the run.
$wpdb->query('ALTER TABLE svz_users AUTO_INCREMENT = 1');
$wpdb->db->begin_transaction();
load_plugin();
run_hook('init');

/** Credentials: not part of the comparison (the Worker keeps them as secrets). */
const SKIP_OPTIONS = ['gff_google_geocode_key', 'gff_dbk_sa_json'];

function snapshot(): array {
	global $wpdb;
	$out = [];
	$out['users'] = array_map(fn($r) => [(string) $r->ID, $r->user_login, $r->user_email, $r->display_name, $r->user_registered, json_encode(roles_of($r->ID))],
		$wpdb->get_results('SELECT ID, user_login, user_email, display_name, user_registered FROM svz_users ORDER BY ID'));
	$out['usermeta'] = array_map(fn($r) => [(string) $r->user_id, $r->meta_key, json_of(maybe_unserialize($r->meta_value))],
		$wpdb->get_results("SELECT user_id, meta_key, meta_value FROM svz_usermeta WHERE meta_key LIKE 'gff\\_%' OR meta_key IN ('first_name', 'last_name') ORDER BY user_id, meta_key"));
	$out['options'] = array_values(array_filter(array_map(fn($r) => [$r->option_name, json_of(maybe_unserialize($r->option_value))],
		$wpdb->get_results("SELECT option_name, option_value FROM svz_options WHERE option_name LIKE 'gff\\_%' ORDER BY option_name")),
		fn($o) => !in_array($o[0], SKIP_OPTIONS, true)));
	$out['transients'] = array_values(array_map(fn($r) => [$r->name, json_of(maybe_unserialize($r->value))],
		$wpdb->get_results("SELECT name, value FROM test_transients ORDER BY name")));
	return $out;
}
function roles_of($id) { $caps = get_user_meta($id, 'svz_capabilities'); return is_array($caps) ? array_keys(array_filter($caps)) : []; }
/** Stored values the way the Worker stores them: arrays as JSON, JSON text re-encoded the same way, everything else as text. */
function json_of($v) {
	if (is_array($v)) return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
	$s = (string) $v;
	if (preg_match('/^[\[{]/', $s) && is_array($d = json_decode($s, true))) return json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
	return $s;
}

$results = [];
foreach ($IN['steps'] as $s) {
	$GLOBALS['UID'] = (int) $s['uid'];
	$_POST = $s['post'] ?? [];
	$_GET = $s['get'] ?? [];
	$_REQUEST = $_POST + $_GET;
	$_FILES = [];
	$GLOBALS['MAIL'] = [];
	$GLOBALS['gff_reg_state'] = ['form_open' => false, 'notice' => '', 'repop' => false, 'old' => []];
	$GLOBALS['PW_N'] = 0; // wp_generate_password()'s stand-in sequence restarts with each request
	$GLOBALS['HEADERS'] = [];
	$_SERVER['HTTP_REFERER'] = $s['referer'] ?? '';
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
	if ($a === '@option') {
		foreach ($_POST as $k => $v) update_option($k, is_string($v) && preg_match('/^[\[{]/', $v) ? json_decode($v, true) : $v);
		$reply = ['die' => ''];
	} elseif (str_starts_with($a, '@meta')) {
		foreach ($_POST as $k => $v) update_user_meta($GLOBALS['UID'], $k, is_string($v) && preg_match('/^[\[{]/', $v) ? json_decode($v, true) : $v);
		$reply = ['die' => ''];
	} elseif (str_starts_with($a, '@job:')) {
		run_hook(substr($a, 5));
		$reply = ['die' => ''];
	} elseif ($a === '@page') {
		$r = $run('wp');
		$st = $GLOBALS['gff_reg_state'];
		$reply = ['notice' => $st['notice'], 'repop' => $st['repop'], 'old' => $st['old'] ?: new stdClass()] + ($r && $r !== ['die' => ''] ? ['exit' => $r] : []);
	} elseif (str_starts_with($a, '@post:')) {
		ob_start();
		try { $reply = $run(($GLOBALS['UID'] ? 'admin_post_' : 'admin_post_nopriv_') . substr($a, 6)) ?? ['die' => '']; ob_end_clean(); }
		catch (TestExit $e) { $reply = ['exit' => true, 'headers' => $GLOBALS['HEADERS'], 'body' => ob_get_clean()]; }
	} elseif ($a === '@options') {
		// WordPress's options.php: the posted option_page's registered settings, through their sanitize callbacks.
		$_SERVER['REQUEST_URI'] = '/wp-admin/options.php';
		gff_reg_register_settings(); gff_reg_register_pay_settings(); gff_reg_register_msg_recipient(); gff_dbk_register_settings();
		$group = $_POST['option_page'] ?? 'gff_reg_settings_group';
		try {
			if (!current_user_can('manage_options')) wp_die('Sorry, you are not allowed to manage options for this site.');
			foreach ($GLOBALS['SETTINGS'][$group] ?? [] as $name => $args) {
				$v = isset($_POST[$name]) ? (is_array($_POST[$name]) ? $_POST[$name] : trim($_POST[$name])) : null;
				update_option($name, call_user_func($args['sanitize_callback'], $v));
			}
			wp_safe_redirect(add_query_arg('settings-updated', 'true', wp_get_referer() ?: $_SERVER['REQUEST_URI']));
		} catch (JsonReply $r) { $reply = $r->body; }
	} elseif (str_starts_with($a, '@admin:')) {
		[$screen, $id] = array_pad(explode(':', substr($a, 7), 2), 2, '0');
		$self = (int) $id === $GLOBALS['UID'];
		$uri = ['clients' => '/wp-admin/admin.php?page=gff-clients', 'settings' => '/wp-admin/admin.php?page=gff-settings', 'dashboard' => '/account/', 'drive' => '/wp-admin/tools.php?page=gff-drive-backup'][$screen]
			?? ($self ? '/wp-admin/profile.php' : '/wp-admin/user-edit.php?user_id=' . (int) $id);
		$_SERVER['REQUEST_URI'] = $_GET ? $uri . (str_contains($uri, '?') ? '&' : '?') . http_build_query($_GET) : $uri;
		ob_start();
		try {
			if ($screen === 'clients') gff_reg_admin_page();
			elseif ($screen === 'settings') gff_reg_settings_page();
			elseif ($screen === 'dashboard') echo gff_admin_dashboard();
			elseif ($screen === 'profile') echo run_hook($self ? 'show_user_profile' : 'edit_user_profile', new WP_User(get_userdata((int) $id))); // user-edit.php passes a WP_User
			elseif ($screen === 'drive') gff_dbk_settings_page();
			elseif ($screen === 'save') echo run_hook($self ? 'personal_options_update' : 'edit_user_profile_update', (int) $id);
			$reply = ['html' => ob_get_clean()];
		} catch (JsonReply $r) { ob_end_clean(); $reply = $r->body; }
	} elseif (!empty($s['workerOnly'])) { $reply = $s['expect']; }
	else {
		$reply = $run(($GLOBALS['UID'] ? 'wp_ajax_' : 'wp_ajax_nopriv_') . $a) ?? ['die' => '0']; // admin-ajax.php with no handler answers "0"
	}
	$results[] = ['reply' => $reply, 'mail' => $GLOBALS['MAIL'], 'state' => snapshot()];
}
$wpdb->db->rollback();
echo json_encode($results, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
