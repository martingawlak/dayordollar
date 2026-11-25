<?php
// THE RACE — daily prices for the dashboard's race strip. One dollar put into each lane on the holder's
// first-seat day; where does that dollar stand today? This file only fetches public prices (Yahoo Finance
// for stocks, a fund and gold; Coinbase for ETH and BTC), caches them for an hour, and answers JSON.
// No keys, no secrets, nothing written but the cache. Deploy next to index.html (martingawlakcompany.com/rainbowgun/race.php).
//
//   GET race.php?start=2026-10-17   →  { asOf, start, lanes: [ { key, name, symbol, startDate, startPrice, nowPrice, value } ] }
//
// "value" = today's worth of one dollar put in on the start day (nowPrice / startPrice). Lanes that cannot be
// priced are left out rather than guessed. The seat lane and the savings lane are computed on the page.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=600");

$LAUNCH = "2026-10-17";                                   // $GAWLAK's first day on Base
$start = isset($_GET["start"]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET["start"]) ? $_GET["start"] : $LAUNCH;
if ($start < $LAUNCH) $start = $LAUNCH;
$today = gmdate("Y-m-d");
if ($start > $today) $start = $today;

// the lanes: add or drop freely; the page draws whatever comes back
$LANES = [
  ["key" => "eth",   "name" => "Ether",            "symbol" => "ETH-USD", "src" => "coinbase"],
  ["key" => "btc",   "name" => "Bitcoin",          "symbol" => "BTC-USD", "src" => "coinbase"],
  ["key" => "spy",   "name" => "S&P 500",          "symbol" => "SPY",     "src" => "yahoo"],
  ["key" => "aapl",  "name" => "Apple",            "symbol" => "AAPL",    "src" => "yahoo"],
  ["key" => "brk",   "name" => "Berkshire",        "symbol" => "BRK-B",   "src" => "yahoo"],
  ["key" => "fund",  "name" => "Vanguard 500 fund","symbol" => "VFIAX",   "src" => "yahoo"],
  ["key" => "gold",  "name" => "Gold",             "symbol" => "GLD",     "src" => "yahoo"],
];

$cacheDir = sys_get_temp_dir() . "/gawlak-race";
@mkdir($cacheDir, 0700, true);
$cacheFile = "$cacheDir/" . preg_replace('/[^0-9-]/', '', $start) . ".json";
if (!isset($_GET["debug"]) && is_file($cacheFile) && filemtime($cacheFile) > time() - 3600) { readfile($cacheFile); exit; }

$DEBUG = isset($_GET["debug"]);
$NOTES = [];
function fetch_json($url) {
  global $NOTES;
  $ctx = stream_context_create(["http" => ["timeout" => 12, "ignore_errors" => true, "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) gawlak-race\r\nAccept: application/json\r\n"]]);
  $raw = @file_get_contents($url, false, $ctx);
  $status = isset($http_response_header[0]) ? $http_response_header[0] : "no response";
  if ($raw === false) { $NOTES[] = "$url → " . ($status === "no response" ? (error_get_last()["message"] ?? "failed") : $status); return null; }
  $j = json_decode($raw, true);
  if (!is_array($j)) { $NOTES[] = "$url → $status, not JSON: " . substr($raw, 0, 80); return null; }
  return $j;
}

// Yahoo: daily closes from the start day; the start price is the first close on or after the start day
// (markets close on weekends), the "now" price is the latest close.
function yahoo_lane($symbol, $start) {
  $p1 = strtotime($start . " 00:00:00 UTC") - 3 * 86400; $p2 = time() + 86400;
  $j = fetch_json("https://query1.finance.yahoo.com/v8/finance/chart/" . rawurlencode($symbol) . "?period1=$p1&period2=$p2&interval=1d");
  $r = $j["chart"]["result"][0] ?? null; if (!$r) return null;
  $ts = $r["timestamp"] ?? []; $cl = $r["indicators"]["quote"][0]["close"] ?? [];
  $startTs = strtotime($start . " 00:00:00 UTC");
  $first = null; $firstDate = null; $last = null;
  foreach ($ts as $i => $t) {
    $c = $cl[$i] ?? null; if ($c === null) continue;
    if ($first === null && $t >= $startTs) { $first = $c; $firstDate = gmdate("Y-m-d", $t); }
    $last = $c;
  }
  if ($first === null && $last !== null) { $first = $last; $firstDate = gmdate("Y-m-d", end($ts)); }   // started today, before the close
  if ($first === null || $last === null || $first <= 0) return null;
  return ["startDate" => $firstDate, "startPrice" => $first, "nowPrice" => $last];
}

// Coinbase: daily candles [time, low, high, open, close, volume], newest first, 300 per call.
function coinbase_lane($product, $start) {
  $startTs = strtotime($start . " 00:00:00 UTC");
  $first = null; $last = null; $lastTs = 0;
  $to = time();
  for ($chunk = 0; $chunk < 8; $chunk++) {                 // up to 8 × 300 days
    $from = max($startTs - 86400, $to - 299 * 86400);
    $j = fetch_json("https://api.exchange.coinbase.com/products/$product/candles?granularity=86400&start=" . gmdate("Y-m-d\TH:i:s\Z", $from) . "&end=" . gmdate("Y-m-d\TH:i:s\Z", $to));
    if (!$j || !count($j)) break;
    foreach ($j as $c) { $t = $c[0]; $close = $c[4];
      if ($t > $lastTs) { $last = $close; $lastTs = $t; }
      if ($t >= $startTs) $first = $close;                   // newest first, so the last one ≥ start is the earliest
    }
    if ($from <= $startTs - 86400) break;
    $to = $from - 1;
  }
  if ($first === null) $first = $last;
  if ($first === null || $last === null || $first <= 0) return null;
  return ["startDate" => $start, "startPrice" => $first, "nowPrice" => $last];
}

$out = ["asOf" => gmdate("c"), "start" => $start, "lanes" => []];
foreach ($LANES as $L) {
  $r = $L["src"] === "yahoo" ? yahoo_lane($L["symbol"], $start) : coinbase_lane($L["symbol"], $start);
  if (!$r) continue;
  $out["lanes"][] = ["key" => $L["key"], "name" => $L["name"], "symbol" => $L["symbol"], "startDate" => $r["startDate"],
    "startPrice" => round($r["startPrice"], 6), "nowPrice" => round($r["nowPrice"], 6), "value" => round($r["nowPrice"] / $r["startPrice"], 6)];
}
if ($DEBUG) { $out["notes"] = $NOTES; $out["env"] = ["php" => PHP_VERSION, "sapi" => PHP_SAPI, "openssl" => extension_loaded("openssl"), "https" => in_array("https", stream_get_wrappers()), "allow_url_fopen" => ini_get("allow_url_fopen")]; }
$json = json_encode($out);
if (count($out["lanes"]) > 0 && !$DEBUG) @file_put_contents($cacheFile, $json);
echo $json;
