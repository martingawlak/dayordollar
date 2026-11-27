<?php
/**
 * The PHP half of test/render.parity.ts: evaluate plugin expressions in one
 * request, in order, and return each one's value (echoed output included).
 * Reads {now, rpc, uid, uri, get, queried, exprs[], options, meta}.
 */
$IN = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['NOW'] = (int) $IN['now'];
$GLOBALS['RPC'] = $IN['rpc'] ?? '';
$GLOBALS['UID'] = (int) ($IN['uid'] ?? 0);
$_SERVER['REQUEST_URI'] = $IN['uri'] ?? '/'; // the page being rendered (wp_referer_field() prints it)
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_GET = $IN['get'] ?: [];
$_POST = [];
$_REQUEST = $_GET;
require __DIR__ . '/wp.php';
if (isset($IN['queried'])) $GLOBALS['QUERIED'] = $IN['queried'] ? new WP_Post($IN['queried'][0], $IN['queried'][1]) : null;
$GLOBALS['wpdb']->query('CREATE TABLE IF NOT EXISTS test_transients (name VARCHAR(191) PRIMARY KEY, value LONGTEXT, expires_at BIGINT)');
$GLOBALS['wpdb']->query('DELETE FROM test_transients');
$GLOBALS['wpdb']->db->begin_transaction(); // every case starts from the same fixture: rolled back at the end
foreach (($IN['users'] ?? []) as [$id, $login, $role]) { $wpdb = $GLOBALS['wpdb']; $wpdb->insert('bxb_users', ['ID' => $id, 'user_login' => $login, 'user_email' => $login . '@example.test', 'display_name' => $login, 'user_registered' => '2026-11-01 00:00:00']); update_user_meta($id, 'bxb_capabilities', [$role => true]); }
foreach (($IN['options'] ?? []) as $k => $v) update_option($k, $v);
foreach (($IN['meta'] ?? []) as [$u, $k, $v]) update_user_meta($u, $k, $v);
load_plugin();
$out = [];
foreach ($IN['exprs'] as $e) {
	ob_start();
	try { $r = eval('return ' . $e . ';'); }
	catch (JsonReply $j) { $r = $j->body; }
	catch (TestExit $x) { $r = ['exit' => true, 'headers' => $GLOBALS['HEADERS'] ?? []]; }
	$echoed = ob_get_clean();
	$out[] = $echoed . (is_string($r) || is_numeric($r) ? (string) $r : ($r === null || $r === false || $r === true ? '' : json_encode($r, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)));
}
$GLOBALS['wpdb']->db->rollback();
echo json_encode(['out' => $out], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
