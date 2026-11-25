/**
 * THE RACE: daily prices for the RainbowGun dashboard's race strip (port of race.php).
 * One dollar put into each lane on the holder's first-seat day; where does that dollar stand today?
 * Fetches public prices only (Yahoo Finance for stocks, a fund and gold; Coinbase for ETH and BTC)
 * and caches the answer for an hour.
 *
 *   GET /rainbowgun/race?start=2026-10-17
 *   → { asOf, start, lanes: [ { key, name, symbol, startDate, startPrice, nowPrice, value } ] }
 *
 * "value" = today's worth of one dollar put in on the start day (nowPrice / startPrice). Lanes that
 * cannot be priced are left out rather than guessed. The seat and savings lanes are computed on the page.
 */

const LAUNCH = "2026-10-17"; // $GAWLAK's first day on Base
const DAY = 86400;

// The lanes: add or drop freely; the page draws whatever comes back.
const LANES = [
  { key: "eth", name: "Ether", symbol: "ETH-USD", src: "coinbase" },
  { key: "btc", name: "Bitcoin", symbol: "BTC-USD", src: "coinbase" },
  { key: "spy", name: "S&P 500", symbol: "SPY", src: "yahoo" },
  { key: "aapl", name: "Apple", symbol: "AAPL", src: "yahoo" },
  { key: "brk", name: "Berkshire", symbol: "BRK-B", src: "yahoo" },
  { key: "fund", name: "Vanguard 500 fund", symbol: "VFIAX", src: "yahoo" },
  { key: "gold", name: "Gold", symbol: "GLD", src: "yahoo" },
] as const;

interface Lane {
  startDate: string;
  startPrice: number;
  nowPrice: number;
}

const ymd = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const startOfDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; gawlak-race)", accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Yahoo: daily closes from the start day. The start price is the first close on or after the start day
// (markets close on weekends); the "now" price is the latest close.
async function yahooLane(symbol: string, start: string): Promise<Lane | null> {
  const startTs = startOfDay(start);
  const p1 = startTs - 3 * DAY;
  const p2 = Math.floor(Date.now() / 1000) + DAY;
  const j = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`,
  );
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const ts: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  let first: number | null = null;
  let firstDate: string | null = null;
  let last: number | null = null;
  ts.forEach((t, i) => {
    const c = closes[i];
    if (c == null) return;
    if (first === null && t >= startTs) {
      first = c;
      firstDate = ymd(t);
    }
    last = c;
  });
  if (first === null && last !== null && ts.length) {
    // Started today, before the close.
    first = last;
    firstDate = ymd(ts[ts.length - 1]);
  }
  if (first === null || last === null || first <= 0 || !firstDate) return null;
  return { startDate: firstDate, startPrice: first, nowPrice: last };
}

// Coinbase: daily candles [time, low, high, open, close, volume], newest first, 300 per call.
async function coinbaseLane(product: string, start: string): Promise<Lane | null> {
  const startTs = startOfDay(start);
  let first: number | null = null;
  let last: number | null = null;
  let lastTs = 0;
  let to = Math.floor(Date.now() / 1000);
  for (let chunk = 0; chunk < 8; chunk++) {
    const from = Math.max(startTs - DAY, to - 299 * DAY);
    const iso = (t: number) => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const j = await fetchJson(
      `https://api.exchange.coinbase.com/products/${product}/candles?granularity=86400&start=${iso(from)}&end=${iso(to)}`,
    );
    if (!Array.isArray(j) || !j.length) break;
    for (const c of j as number[][]) {
      const [t, , , , close] = c;
      if (t > lastTs) {
        last = close;
        lastTs = t;
      }
      if (t >= startTs) first = close; // newest first, so the last one at or after start is the earliest
    }
    if (from <= startTs - DAY) break;
    to = from - 1;
  }
  if (first === null) first = last;
  if (first === null || last === null || first <= 0) return null;
  return { startDate: start, startPrice: first, nowPrice: last };
}

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  let start = url.searchParams.get("start") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < LAUNCH) start = LAUNCH;
  if (start > today) start = today;

  // One cached answer per start day, for an hour.
  const cacheKey = new Request(`${url.origin}/rainbowgun/race?start=${start}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const results = await Promise.all(
    LANES.map((l) => (l.src === "yahoo" ? yahooLane(l.symbol, start) : coinbaseLane(l.symbol, start))),
  );
  const lanes = LANES.flatMap((l, i) => {
    const r = results[i];
    if (!r) return [];
    return [
      {
        key: l.key,
        name: l.name,
        symbol: l.symbol,
        startDate: r.startDate,
        startPrice: round6(r.startPrice),
        nowPrice: round6(r.nowPrice),
        value: round6(r.nowPrice / r.startPrice),
      },
    ];
  });

  const body = JSON.stringify({ asOf: new Date().toISOString(), start, lanes });
  const response = new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" },
  });
  if (lanes.length) {
    const cached = new Response(body, { headers: { ...Object.fromEntries(response.headers), "cache-control": "public, max-age=3600" } });
    waitUntil(cache.put(cacheKey, cached));
  }
  return response;
};
