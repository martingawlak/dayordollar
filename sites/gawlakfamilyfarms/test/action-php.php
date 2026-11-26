<?php
/**
 * The PHP half of test/actions.parity.ts: replay AJAX calls through the
 * plugin's own handlers (wp_ajax_* / wp_ajax_nopriv_* hooks) on gff_fixture,
 * and after each one record the JSON reply, the mail sent, and the plugin's
 * stored state. Reads {now, rpc, steps:[{uid, action, post}]}; everything is
 * rolled back at the end so every run starts from the same fixture.
 */
$IN = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['NOW'] = (int) $IN['now'];
$GLOBALS['RPC'] = $IN['rpc'] ?? '';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require __DIR__ . '/wp.php';
$wpdb = $GLOBALS['wpdb'];
$wpdb->query('CREATE TABLE IF NOT EXISTS test_transients (name VARCHAR(191) PRIMARY KEY, value LONGTEXT, expires_at BIGINT)');
$wpdb->query('DELETE FROM test_transients');
// Rolled-back inserts still use up InnoDB ids: reset the counters (to max + 1, as SQLite continues) before the run.
foreach (['dodz_gifts', 'dodz_commissions'] as $t) $wpdb->query("ALTER TABLE svz_$t AUTO_INCREMENT = 1");
$wpdb->db->begin_transaction();
load_plugin();
run_hook('init');

/** Options that are credentials or caches of them: not part of the comparison. */
const SKIP_OPTIONS = ['dodz_gift_key', 'dodz_buyback_key', 'dodz_merch_key', 'dodz_api_key', 'dodz_pf_token', 'dodz_pp_secret', 'dodz_gdrive_client_secret'];

function snapshot(): array {
	global $wpdb;
	$out = [];
	foreach (['dodz_gifts', 'dodz_commissions'] as $t) {
		$out[$t] = array_map(fn($r) => array_map(fn($v) => $v === null ? null : (string) $v, (array) $r), $wpdb->get_results("SELECT * FROM svz_$t ORDER BY id"));
	}
	$out['usermeta'] = array_map(fn($r) => [(string) $r->user_id, $r->meta_key, json_of(maybe_unserialize($r->meta_value))],
		$wpdb->get_results("SELECT user_id, meta_key, meta_value FROM svz_usermeta WHERE meta_key LIKE 'gff\\_%' ORDER BY user_id, meta_key"));
	$out['options'] = array_values(array_filter(array_map(fn($r) => [$r->option_name, json_of(maybe_unserialize($r->option_value))],
		$wpdb->get_results("SELECT option_name, option_value FROM svz_options WHERE option_name LIKE 'gff\\_%' ORDER BY option_name")),
		fn($o) => !in_array($o[0], SKIP_OPTIONS, true) && strpos($o[0], 'dodz_addr_') !== 0));
	$out['transients'] = array_values(array_map(fn($r) => [$r->name, json_of(maybe_unserialize($r->value))],
		array_filter($wpdb->get_results("SELECT name, value FROM test_transients ORDER BY name"), fn($r) => !is_cache($r->name))));
	return $out;
}
/** Zora API, balance and price caches: the same keys on both sides, but not state worth comparing. */
function is_cache($n) { return (bool) preg_match('/^dodz_([0-9a-f]{32}$|bal_|ethusd_)/', $n); }
/** Stored values the way the Worker stores them: arrays as JSON, everything else as text. */
function json_of($v) { return is_array($v) ? json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : (string) $v; }

$results = [];
foreach ($IN['steps'] as $s) {
	$GLOBALS['UID'] = (int) $s['uid'];
	$_POST = $s['post'] ?? [];
	$_GET = $s['get'] ?? [];
	$_REQUEST = $_POST + $_GET;
	$_FILES = [];
	$GLOBALS['MAIL'] = [];
	$hook = ($GLOBALS['UID'] ? 'wp_ajax_' : 'wp_ajax_nopriv_') . $s['action'];
	$cbs = $GLOBALS['HOOKS'][$hook] ?? [];
	ksort($cbs);
	$reply = null;
	if (str_starts_with($s['action'], '@option')) {
		// Test-only: change settings first (post = name => value; JSON objects/arrays become PHP arrays).
		foreach ($_POST as $k => $v) update_option($k, is_string($v) && preg_match('/^[\[{]/', $v) ? json_decode($v, true) : $v);
		$reply = ['die' => ''];
	} elseif (str_starts_with($s['action'], '@meta')) {
		// Test-only: set user meta first (post = key => value for the step's uid; JSON objects/arrays become PHP arrays).
		foreach ($_POST as $k => $v) update_user_meta($GLOBALS['UID'], $k, is_string($v) && preg_match('/^[\[{]/', $v) ? json_decode($v, true) : $v);
		$reply = ['die' => ''];
	} elseif (str_starts_with($s['action'], '@job:')) {
		// Test-only: run one of the plugin's scheduled jobs (a WP-Cron hook) now.
		run_hook(substr($s['action'], 5));
		$reply = ['die' => ''];
	} elseif (str_starts_with($s['action'], '@admin')) {
		// Test-only: Settings → DayorDollar, posted as the step's user (post = the form fields).
		ob_start(); dodz_admin_page(); $reply = ['html' => ob_get_clean()];
	} elseif (!empty($s['workerOnly'])) { $reply = $s['expect']; }
	elseif (!$cbs) { $reply = ['die' => '0']; } // admin-ajax.php with no handler answers "0"
	else {
		try { foreach ($cbs as $list) foreach ($list as $cb) $cb(); $reply = ['die' => '']; }
		catch (JsonReply $r) { $reply = $r->body; }
	}
	$results[] = ['reply' => $reply, 'mail' => $GLOBALS['MAIL'], 'state' => snapshot()];
}
$wpdb->db->rollback();
echo json_encode($results, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
