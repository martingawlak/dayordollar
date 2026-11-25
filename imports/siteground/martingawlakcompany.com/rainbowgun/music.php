<?php
// THE JUKEBOX LIST (Marti, 2026-10-18: "play MP3 files I upload to the site in the background").
// Lists the MP3s in the music/ folder next to this file, as JSON, sorted by name. Marti uploads his own
// tracks there (any name; "01 Title.mp3" sorts first); the player reads this list and plays them in order.
// Only *.mp3 directly in music/, never anything else; nothing is logged.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
$dir = __DIR__ . "/music";
$tracks = [];
if (is_dir($dir)) {
  // only .mp3 files, and none over 40 MB (a full-album file would download the whole album for one tap)
  $files = array_filter(scandir($dir) ?: [], function ($f) use ($dir) { $p = $dir . "/" . $f; return preg_match('/\.mp3$/i', $f) && is_file($p) && filesize($p) <= 40 * 1024 * 1024; });
  if ($files) {
    natcasesort($files);
    foreach ($files as $base) {
      $name = preg_replace('/^(\d+[\s._-]+)+/', '', pathinfo($base, PATHINFO_FILENAME));   // "01 - 01 - Title" → "Title"; "960JesusCoupe" keeps its 960
      $tracks[] = ["file" => "music/" . rawurlencode($base), "name" => $name !== "" ? $name : $base];
    }
  }
}
echo json_encode(["tracks" => $tracks], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
