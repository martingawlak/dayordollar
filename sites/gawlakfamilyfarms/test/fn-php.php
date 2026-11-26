<?php
/**
 * The PHP half of test/render.parity.ts: evaluate plugin expressions in one
 * request, in order, and return each one's value (echoed output included),
 * plus what the request enqueued (scripts, styles, their inline code, localized
 * data). Reads {now, rpc, uid, permalink, exprs[], options, meta}.
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
$obj = fn($a) => $a ?: new stdClass();
echo json_encode(['out' => $out, 'assets' => ['scripts' => $obj($GLOBALS['SCRIPTS']), 'styles' => $obj($GLOBALS['STYLES']), 'localized' => $obj($GLOBALS['LOCALIZED'] ?? []),
	'inline_styles' => $obj($GLOBALS['INLINE_STYLES']), 'inline_scripts' => $obj($GLOBALS['INLINE_SCRIPTS'])]], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
