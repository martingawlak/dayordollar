/**
 * A pretend brand site for trying the shared account panel in a browser:
 * serves a page with the panel, and /account/api/* backed by a local SQLite
 * Inbox. Pick who you are with ?as=<user id> (sets a cookie).
 *   npx tsx test/panel-harness.ts   → http://localhost:8799/?as=sam
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Inbox, inboxHttp } from "../src/worker/inbox";
import { d1, migrate } from "./sqlite";

const sqlite = new DatabaseSync(":memory:");
migrate(sqlite);
const people: [string, string, string, string?][] = [
  ["sam", "Sam Carter", "sam@example.com"],
  ["jo", "Jordan Lee", "jordan@example.com"],
  ["ana", "Ana Ruiz", "ana@example.com"],
  ["martin", "Martin Gawlak", "martin@example.com"],
  ["riley", "Riley (Purple Martins)", "riley@example.com"],
  ["new", "", "new@example.com"],
];
for (const [id, name, email] of people)
  sqlite.prepare(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 1, '2026-01-01', '2026-01-01')`).run(id, name, email);
const inbox = new Inbox({ db: d1(sqlite), notify: async (n) => console.log(`[notice] ${n.fromName} → ${n.to}: ${n.subject}`) });

const site = process.env.SITE ?? "gff";
const css = readFileSync(new URL("../src/panel/panel.css", import.meta.url), "utf8");
const panel = () => `(()=>{const CSS_TEXT=${JSON.stringify(css)};\n${readFileSync(new URL("../src/panel/panel.js", import.meta.url), "utf8")}\n})();`;
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account</title>
<style>body{margin:0;font-family:Georgia,serif;font-size:62.5%} button{background:red!important} h1{color:green} .site{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #ddd;font:700 18px sans-serif}</style></head>
<body><div class="site"><img src="https://gawlakfamilyfarms.com/wp-content/uploads/2024/03/GawlakFamilyFarmsLogo-94x50.png" height="40">Gawlak Family Farms</div>
<div id="mgc-account" data-site="${site}" data-api="/account/api" data-signout="/auth/logout"></div>
<h2 style="font:20px sans-serif;padding:0 16px">Your farm (the site's own part)</h2>
<script src="/panel.js" defer></script></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url!, "http://localhost:8799");
  const as = url.searchParams.get("as");
  const who = as ?? /(?:^|; )as=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  if (url.pathname === "/panel.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(panel());
  const m = url.pathname.match(/^\/account\/api\/([a-z]+)$/);
  if (m) {
    if (!who) return void res.writeHead(401, { "content-type": "application/json" }).end('{"error":"Sign in again."}');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await inboxHttp(inbox, who, site, new Request(url, { method: req.method, headers: { "content-type": "application/json" }, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), m[1]);
    return void res.writeHead(r.status, { "content-type": "application/json" }).end(await r.text());
  }
  res.writeHead(200, { "content-type": "text/html", ...(as ? { "set-cookie": `as=${as}; Path=/` } : {}) }).end(page);
}).listen(8799, () => console.log("http://localhost:8799/?as=sam"));
