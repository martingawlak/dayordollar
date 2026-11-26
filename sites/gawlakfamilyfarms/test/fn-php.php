<?php
/**
 * The PHP half of test/render.parity.ts: evaluate plugin expressions in one
 * request, in order, and return each one's value (echoed output included),
 * plus what the request enqueued. Reads {now, rpc, uid, permalink, exprs[]}.
 */
$IN = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['NOW'] = (int) $IN['now'];
$GLOBALS['RPC'] = $IN['rpc'] ?? '';
$GLOBALS['UID'] = (int) ($IN['uid'] ?? 0);
$GLOBALS['PERMALINK'] = $IN['permalink'] ?? '/';
$GLOBALS['IS_PAGE'] = true;
require __DIR__ . '/wp.php';
$GLOBALS['wpdb']->query('CREATE TABLE IF NOT EXISTS test_transients (name VARCHAR(191) PRIMARY KEY, value LONGTEXT, expires_at BIGINT)');
$GLOBALS['wpdb']->query('DELETE FROM test_transients');
$GLOBALS['wpdb']->db->begin_transaction(); // every case starts from the same fixture: rolled back at the end
foreach (($IN['options'] ?? []) as $k => $v) update_option($k, $v);
foreach (($IN['meta'] ?? []) as [$u, $k, $v]) update_user_meta($u, $k, $v);
load_plugin();
$out = [];
foreach ($IN['exprs'] as $e) {
	ob_start();
	$r = eval('return ' . $e . ';');
	$echoed = ob_get_clean();
	$out[] = $echoed . (is_string($r) || is_numeric($r) ? (string) $r : ($r === null || $r === false || $r === true ? '' : json_encode($r, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)));
}
$GLOBALS['wpdb']->db->rollback();
echo json_encode(['out' => $out, 'scripts' => $GLOBALS['SCRIPTS'], 'localized' => $GLOBALS['LOCALIZED'] ?? new stdClass(), 'inline' => $GLOBALS['INLINE_STYLES'] ?: new stdClass()], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
