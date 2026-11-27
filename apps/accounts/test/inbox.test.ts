/**
 * The Inbox rules Martin approved (2026-11-27), against a real SQLite database
 * built from the accounts migrations. Run: npm test -w @mgc/accounts
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Inbox, inboxHttp, LOOKUP_MISSES_PER_DAY, NOTICES_PER_DAY, type Notice } from "../src/worker/inbox";
import { d1, migrate } from "./sqlite";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("pragma foreign_keys = on");
  migrate(sqlite);
  const add = (id: string, name: string, email: string) =>
    sqlite.prepare(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 1, '2026-01-01', '2026-01-01')`).run(id, name, email);
  add("sam", "Sam Carter", "sam@example.com");
  add("jo", "Jordan Lee", "Jordan@Example.com");
  add("ana", "Ana Ruiz", "ana@example.com");
  add("noname", "", "anon@example.com");
  for (let i = 0; i < 5; i++) add(`p${i}`, `Person ${i}`, `p${i}@example.com`);
  let clock = Date.parse("2026-11-28T12:00:00Z");
  const sent: Notice[] = [];
  const inbox = new Inbox({ db: d1(sqlite), now: () => clock, notify: async (n) => void sent.push(n) });
  return { sqlite, inbox, sent, tick: (ms: number) => (clock += ms), add };
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const rejects = async (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

test("a first message is a request; the writer waits until it is answered", async () => {
  const { inbox } = setup();
  const r = await inbox.send("sam", "bandturo", { email: " jordan@example.com ", body: "Hi Jordan!" });
  assert.equal(r.request, true);
  assert.equal(r.to.name, "Jordan Lee");
  await rejects(inbox.send("sam", "bandturo", { to: "jo", body: "again" }), /Waiting for Jordan Lee/);
  const jo = await inbox.summary("jo");
  assert.equal(jo.requests, 1);
  assert.equal(jo.unread, 1);
  assert.equal(jo.threads[0].relation, "request_in");
  assert.equal(jo.threads[0].with.name, "Sam Carter");
  assert.equal(JSON.stringify(jo).includes("sam@example.com"), false, "the writer's email is never shown");
  const sam = await inbox.summary("sam");
  assert.equal(sam.threads[0].relation, "waiting");
});

test("accepting connects both ways; then they write freely", async () => {
  const { inbox } = setup();
  await inbox.send("sam", "gff", { email: "jordan@example.com", body: "Hi" });
  await inbox.answer("jo", "sam", "accept");
  await inbox.send("sam", "gff", { to: "jo", body: "Thanks!" });
  await inbox.send("jo", "fppm", { to: "sam", body: "Any time" });
  const t = await inbox.thread("sam", "jo");
  assert.equal(t.relation, "connected");
  assert.deepEqual(t.messages.map((m) => [m.mine, m.body, m.site]), [[true, "Hi", "gff"], [true, "Thanks!", "gff"], [false, "Any time", "fppm"]]);
  assert.deepEqual((await inbox.connections("jo")).connected.map((p) => p.id), ["sam"]);
});

test("writing back to a request accepts it", async () => {
  const { inbox } = setup();
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  await inbox.send("jo", "mgc", { to: "sam", body: "Hey" });
  assert.equal((await inbox.thread("sam", "jo")).relation, "connected");
});

test("ignore: the request disappears for them, the writer still just waits", async () => {
  const { inbox } = setup();
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  await inbox.answer("jo", "sam", "ignore");
  assert.equal((await inbox.summary("jo")).threads.length, 0);
  assert.equal((await inbox.counts("jo")).unread, 0);
  assert.equal((await inbox.summary("sam")).threads[0].relation, "waiting");
  await rejects(inbox.send("sam", "mgc", { to: "jo", body: "hello?" }), /Waiting/);
});

test("block: hidden, the blocked one can't tell, unblock starts fresh", async () => {
  const { inbox } = setup();
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  await inbox.answer("jo", "sam", "accept");
  await inbox.answer("jo", "sam", "block");
  await rejects(inbox.send("sam", "mgc", { to: "jo", body: "?" }), /Waiting/);
  await rejects(inbox.send("jo", "mgc", { to: "sam", body: "?" }), /You blocked/);
  assert.deepEqual((await inbox.connections("jo")).blocked.map((p) => p.id), ["sam"]);
  assert.equal((await inbox.summary("jo")).threads.length, 0);
  await inbox.answer("jo", "sam", "unblock");
  const r = await inbox.send("jo", "mgc", { to: "sam", body: "Sorry" });
  assert.equal(r.request, true);
});

test("3 new people a day (rolling 24 hours); connected people don't count", async () => {
  const { inbox, tick } = setup();
  for (let i = 0; i < 3; i++) await inbox.send("sam", "mgc", { email: `p${i}@example.com`, body: "Hi" });
  await rejects(inbox.send("sam", "mgc", { email: "p3@example.com", body: "Hi" }), /3 new people today/);
  await inbox.answer("p0", "sam", "accept");
  await inbox.send("sam", "mgc", { to: "p0", body: "still fine" });
  tick(24 * 60 * 60 * 1000 + 1);
  await inbox.send("sam", "mgc", { email: "p3@example.com", body: "Hi" });
});

test("unknown addresses: a plain answer, at most 10 a day", async () => {
  const { inbox } = setup();
  for (let i = 0; i < LOOKUP_MISSES_PER_DAY; i++) await rejects(inbox.send("sam", "mgc", { email: `nobody${i}@x.com`, body: "Hi" }), /No member uses that email/);
  await rejects(inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" }), /Too many addresses/);
});

test("a name is needed to write; settings change it and the notices", async () => {
  const { inbox } = setup();
  await rejects(inbox.send("noname", "mgc", { email: "sam@example.com", body: "Hi" }), /Add your name/);
  await inbox.settings("noname", { name: "  Pat   Doe ", notify: false });
  const s = await inbox.summary("noname");
  assert.equal(s.me.name, "Pat Doe");
  assert.equal(s.me.notify, false);
  await rejects(inbox.settings("noname", { name: "  " }), /can't be empty/);
});

test("messages: empty, too long, to yourself", async () => {
  const { inbox } = setup();
  await rejects(inbox.send("sam", "mgc", { to: "jo", body: "   " }), /Write a message/);
  await rejects(inbox.send("sam", "mgc", { to: "jo", body: "x".repeat(4001) }), /under 4000/);
  await rejects(inbox.send("sam", "mgc", { email: "SAM@example.com", body: "me" }), /That's you/);
});

test("one email per batch: none again until the Inbox is opened", async () => {
  const { inbox, sent, tick } = setup();
  await inbox.send("sam", "bandturo", { email: "jordan@example.com", body: "Hi" });
  await inbox.answer("jo", "sam", "accept"); // answering does not open the Inbox list
  await inbox.send("sam", "bandturo", { to: "jo", body: "two" });
  await inbox.send("sam", "bandturo", { to: "jo", body: "three" });
  assert.equal(sent.length, 1);
  const n = sent[0];
  assert.equal(n.to, "Jordan@Example.com");
  assert.equal(n.fromName, "Bandturo");
  assert.equal(n.fromAddress, "bandturo@martingawlakcompany.com");
  assert.equal(n.subject, "Sam Carter sent you a message");
  assert.match(n.html, /message request on Bandturo/);
  assert.match(n.html, /https:\/\/bandturo\.com\/account\/#inbox/);
  assert.equal(/two|three/.test(n.text), false, "the message text is not in the email");
  tick(1000);
  await inbox.summary("jo");
  tick(1000);
  await inbox.send("sam", "dayordollar", { to: "jo", body: "four" });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].fromName, "DayorDollar");
  assert.match(sent[1].text, /sent you a message on DayorDollar/);
});

test("notices off: no email", async () => {
  const { inbox, sent } = setup();
  await inbox.settings("jo", { notify: false });
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  assert.equal(sent.length, 0);
});

test("at most 60 notices a day across everyone", async () => {
  const { inbox, sent, add } = setup();
  for (let i = 0; i < NOTICES_PER_DAY + 2; i++) {
    add(`w${i}`, `Writer ${i}`, `w${i}@example.com`);
    add(`r${i}`, `Reader ${i}`, `r${i}@example.com`);
    await inbox.send(`w${i}`, "mgc", { email: `r${i}@example.com`, body: "Hi" });
  }
  assert.equal(sent.length, NOTICES_PER_DAY);
});

test("names in notices are escaped", async () => {
  const { inbox, sent } = setup();
  await inbox.settings("sam", { name: "<b>Sam</b>" });
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  assert.match(sent[0].html, /&lt;b&gt;Sam&lt;\/b&gt;/);
});

test("deleting an account removes its messages and connections", async () => {
  const { inbox, sqlite } = setup();
  await inbox.send("sam", "mgc", { email: "jordan@example.com", body: "Hi" });
  sqlite.prepare(`delete from "user" where id = 'sam'`).run();
  assert.equal((await inbox.summary("jo")).threads.length, 0);
  assert.equal((sqlite.prepare("select count(*) n from member_connection").get() as { n: number }).n, 0);
});

test("over HTTP: errors come back as { error } with a status", async () => {
  const { inbox } = setup();
  const post = (op: string, body: unknown) => inboxHttp(inbox, "sam", "mgc", new Request(`https://x/inbox/${op}`, { method: "POST", body: JSON.stringify(body) }), op);
  const r = await post("send", { email: "jordan@example.com", body: "Hi" });
  assert.equal(r.status, 200);
  const again = await post("send", { to: "jo", body: "Hi" });
  assert.equal(again.status, 409);
  assert.match(((await again.json()) as { error: string }).error, /Waiting/);
  const got = await inboxHttp(inbox, "jo", "mgc", new Request("https://x/inbox/thread?with=sam"), "thread");
  assert.equal(((await got.json()) as { messages: unknown[] }).messages.length, 1);
  assert.equal((await inboxHttp(inbox, "jo", "mgc", new Request("https://x/inbox/nope"), "nope")).status, 404);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split("\n").slice(0, 4).join("\n     ")}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
