<?php
/**
 * Dump every published page's Beaver Builder layout as JSON, for export.py to
 * render. Beaver Builder stores its layout as serialized PHP objects in
 * postmeta `_fl_builder_data`, which only PHP reads reliably.
 *
 *   php scripts/wp-export/bb-dump.php <db> <prefix>  > /tmp/bb.json
 *
 * Output: { "<post id>": { "hideTitle": bool, "nodes": [ {node, type, parent, position, settings}, ... ] } }
 */
[$_, $dbName, $prefix] = $argv + [null, 'db30ppfkssttcs', 'byz_'];
$db = new mysqli('localhost', 'root', '', $dbName);
$db->set_charset('utf8mb4');
$sql = "select p.ID, m.meta_value,
          (select meta_value from {$prefix}postmeta h where h.post_id = p.ID and h.meta_key = 'hpt_headertitle' limit 1)
        from {$prefix}posts p
        join {$prefix}postmeta m on m.post_id = p.ID and m.meta_key = '_fl_builder_data'
        join {$prefix}postmeta e on e.post_id = p.ID and e.meta_key = '_fl_builder_enabled' and e.meta_value = '1'
        where p.post_status = 'publish' and p.post_type in ('page', 'post')";
$out = [];
$res = $db->query($sql);
while ([$id, $raw, $hide] = $res->fetch_row()) {
  $data = @unserialize($raw);
  if (!is_array($data)) continue;
  $nodes = [];
  foreach ($data as $n) {
    $nodes[] = [
      'node' => $n->node, 'type' => $n->type, 'parent' => $n->parent, 'position' => (int) $n->position,
      'settings' => is_object($n->settings) ? $n->settings : new stdClass(),
    ];
  }
  $out[(string) $id] = ['hideTitle' => $hide === 'on', 'nodes' => $nodes];
}
// Media the layouts point at by attachment id (background videos and their fallbacks, photos).
$ids = [];
foreach ($out as $page) foreach ($page['nodes'] as $n) foreach (['bg_video', 'bg_video_fallback', 'bg_image', 'photo', 'video'] as $k) {
  $v = $n['settings']->$k ?? '';
  if (is_scalar($v) && ctype_digit((string) $v)) $ids[(int) $v] = true;
}
$media = [];
if ($ids) {
  $r = $db->query("select post_id, meta_value from {$prefix}postmeta where meta_key = '_wp_attached_file' and post_id in (" . implode(',', array_keys($ids)) . ")");
  while ([$pid, $file] = $r->fetch_row()) $media[(string) $pid] = '/wp-content/uploads/' . $file;
}
$out = ['pages' => $out, 'media' => $media];
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
