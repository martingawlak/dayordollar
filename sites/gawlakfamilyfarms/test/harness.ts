/**
 * Shared test bench for the parity tests: the same data, the same clock and the
 * same outside world for the plugin (PHP on the gff_fixture MariaDB database)
 * and the Worker (SQLite through test/d1-shim.ts).
 *
 * - The database: gff_fixture (built by test/fixture.sh from the live data,
 *   credentials replaced by test values) is imported into SQLite with the
 *   real importer, so the import is tested on every run.
 * - The outside world: one local fake server answers every outside service
 *   under its own path (see TEST_HOST_PATHS in test/wp.php). The PHP side's
 *   wp_remote_* calls and the Worker's fetch() are both pointed at it.
 */
import { execFile, execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "node:net";
import { d1 } from "./d1-shim";
import type { Env } from "../src/env";

export const here = (p: string) => new URL(p, import.meta.url).pathname;

/** The fixed "now" both sides run at (2026-11-20 12:00 UTC). */
export const NOW = 1795176000;

export const HOST_PATHS: Record<string, string> = {
  "https://mainnet.base.org": "/rpc",
  "https://api-sdk.zora.engineering": "/zora",
  "https://api-m.sandbox.paypal.com": "/paypal",
  "https://api-m.paypal.com": "/paypal",
  "https://api.printful.com": "/printful",
  "https://oauth2.googleapis.com": "/google-oauth",
  "https://www.googleapis.com": "/google",
  "https://api.coinbase.com": "/coinbase",
  "https://api.developer.coinbase.com": "/paymaster",
};

export type Handler = (path: string, body: string, req: IncomingMessage) => unknown;

const ZORA: Record<string, unknown> = JSON.parse(readFileSync(here("./fixtures/zora.json"), "utf8"));

/** JSON-RPC answers shared by every test: a quiet Base where every ERC-20 balance is 1234.5 tokens. */
export function rpcAnswer(method: string, params: any[]): unknown {
  switch (method) {
    case "eth_chainId": return "0x2105";
    case "eth_blockNumber": return "0x1e00000";
    case "eth_getBalance": return "0x" + (12345n * 10n ** 14n).toString(16);
    case "eth_call": {
      const data: string = params?.[0]?.data ?? "";
      if (data.startsWith("0x70a08231")) return "0x" + (12345n * 10n ** 17n).toString(16).padStart(64, "0"); // balanceOf
      if (data.startsWith("0x313ce567")) return "0x" + (18).toString(16).padStart(64, "0"); // decimals
      return "0x";
    }
    case "eth_getLogs": return [];
    case "eth_getTransactionCount": return "0x0";
    case "eth_gasPrice": return "0x3b9aca00";
    case "eth_estimateGas": return "0x5208";
    default: return null;
  }
}

/** Start the fake outside world. `extra` answers first; return undefined to fall through. */
export async function fakeServer(extra?: Handler): Promise<{ base: string; close: () => void; log: string[] }> {
  const log: string[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = req.url ?? "/";
    log.push(`${req.method} ${url}`);
    let out: unknown = extra?.(url, body, req);
    if (out === undefined) {
      if (url.startsWith("/zora/")) out = ZORA[url.slice(5)] ?? { __status: 404, __body: "{}" };
      else if (url.startsWith("/rpc")) {
        const j = JSON.parse(body || "{}");
        out = { jsonrpc: "2.0", id: j.id ?? 1, result: rpcAnswer(j.method, j.params) };
      } else out = { __status: 404, __body: JSON.stringify({ error: "no fake for " + url }) };
    }
    const o = out as { __status?: number; __body?: string };
    res.writeHead(o?.__status ?? 200, { "content-type": "application/json" });
    res.end(o?.__status !== undefined ? (o.__body ?? "") : JSON.stringify(out));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => server.close(), log };
}

/** Point the Worker's fetch() at the fake server, as wp.php does for the plugin. */
export function routeFetch(base: string): void {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (const [host, path] of Object.entries(HOST_PATHS)) if (url.startsWith(host)) url = base + path + url.slice(host.length);
    if (!url.startsWith(base)) return Promise.reject(new Error("no network in tests: " + url));
    return real(url, input instanceof Request ? { method: input.method, headers: input.headers, body: (input as any).body, ...init } : init);
  }) as typeof fetch;
}

/** A fresh SQLite copy of the fixture, imported by the real importer. */
let importSql: string | null = null;
export function freshDb(): DatabaseSync {
  importSql ??= execFileSync("python3", ["-I", here("../scripts/import-wordpress.py"), "--db", "gff_fixture", "--prefix", "svz_"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) as string;
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(here("../migrations")).sort()) db.exec(readFileSync(here("../migrations/" + f), "utf8"));
  // The tests reset MySQL's id counters to max + 1 before each run; SQLite does the same without the carried-over counter.
  db.exec(importSql.split("\n").filter((l) => !l.startsWith("INSERT OR REPLACE INTO sqlite_sequence")).join("\n"));
  return db;
}

/** The Worker's environment over a SQLite database, with the fixture's test credentials. */
export function testEnv(db: DatabaseSync, over: Partial<Env> = {}): Env {
  return {
    DB: d1(db),
    SSO_ISSUER: "https://accounts.test/api/auth",
    SSO_CLIENT_ID: "test",
    SSO_CLIENT_SECRET: "test",
    SESSION_SECRET: "test-session-secret-test-session-secret",
    SITE_ORIGIN: "https://gawlakfamilyfarms.com",
    GIFT_KEY: "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    BUYBACK_KEY: "5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    ZORA_API_KEY: "test-zora-key",
    PRINTFUL_TOKEN: "test-pf-token",
    PAYPAL_SECRET: "test-pp-secret",
    GDRIVE_CLIENT_SECRET: "test-gdrive-secret",
    MAIL_LOG: [],
    ...over,
  };
}

/**
 * Run a PHP half (a script under test/) with JSON in, JSON out. Asynchronous,
 * so the fake server in this same process can answer the plugin's calls.
 */
export function php<T = any>(script: string, input: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = execFile("php", [here("./" + script)], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error(`${script} failed: ${err.message}\n${errOut}\n${out.slice(0, 2000)}`));
      try { resolve(JSON.parse(out) as T); } catch { reject(new Error(`${script} printed non-JSON:\n${out.slice(0, 2000)}`)); }
    });
    child.stdin!.end(JSON.stringify(input));
  });
}

/** The first difference between two strings, with context, for a readable failure. */
export function firstDiff(a: string, b: string, ctx = 160): string | null {
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i} of ${a.length}/${b.length}\n  plugin: …${JSON.stringify(a.slice(Math.max(0, i - ctx), i + ctx))}\n  worker: …${JSON.stringify(b.slice(Math.max(0, i - ctx), i + ctx))}`;
}
