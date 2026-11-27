/*
 * The shared account panel (design approved by Martin, 2026-11-27): the MGC
 * brand bubbles, then Hi + Inbox / Connections / Settings. Every brand site
 * puts it at the top of its own account page:
 *
 *   <div id="mgc-account" data-site="gff" data-api="/account/api" data-signout="/auth/logout"></div>
 *   <script src="https://accounts.martingawlakcompany.com/panel.js" defer></script>
 *
 * data-api is the site's own proxy to the accounts service (same origin, its
 * own session cookie), so no third-party cookies are involved. When nobody is
 * signed in the panel stays empty and the site's own sign-in shows instead.
 * Served by the accounts Worker, which wraps this file and defines CSS.
 */
/* global CSS_TEXT */
const host = document.getElementById("mgc-account");
if (host && !host.shadowRoot) {
  const SITE = host.dataset.site || "mgc";
  const API = (host.dataset.api || "/account/api").replace(/\/$/, "");
  const SIGNOUT = host.dataset.signout || "/auth/logout";
  const ACCOUNTS = "https://accounts.martingawlakcompany.com";
  const CDN = "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/";
  const COINS = "https://martingawlakcompany.com/wp-content/plugins/mgc-zora-launchpad/assets/coins/";
  // The pictures of the brand orbit on martingawlakcompany.com, plus the farm.
  // Martin's order (2026-11-27): MGC, BZG, Bandturo, DoD, $GAWLAK, FPPM, Farm.
  const BRANDS = [
    ["mgc", "MGC", "https://martingawlakcompany.com/", CDN + "aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZhaGVxMmt5bDRpMmJxZGp3ZHdvNzZjcnV1ZnpwNG40a2lvZmRpbXFvdXJvenh0ZWdmNmk="],
    ["babyzora", "BabyZora", "https://babyzoragawlak.com/", CDN + "aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWVibW5iZ2U3NnpwMzdhenJqcXNtNXB4ZzY1bDRub2N3Y2J6eDZlZWg2YnRqc2ZvaXJ0N2E="],
    ["bandturo", "Bandturo", "https://bandturo.com/", CDN + "aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJraDNqa2RnYTN2eHVmdDY0aWNseGJqajZ3NHZsYmdydW43cDZpN210eWdzYmk1cnZ4M2E="],
    ["dayordollar", "DayorDollar", "https://dayordollar.com/", CDN + "aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhub2xucHR6aGZqYXVtcnFzbGhoZmhvMjZtcnNpcWgyN25qenU2MnJ1c2FzNHRsY2R5emE="],
    ["familybank", "$GAWLAK", "https://martingawlakcompany.com/rainbowgun/", COINS + "gawlak.png"],
    ["fppm", "FPPM", "https://fppm.us/", COINS + "fppm.png"],
    ["gff", "Farm", "https://gawlakfamilyfarms.com/", "https://gawlakfamilyfarms.com/wp-content/uploads/2024/03/GawlakFamilyFarmsLogo-300x159.png", "fit"],
  ];
  const SITE_NAMES = { mgc: "Martin Gawlak Company", bandturo: "Bandturo", dayordollar: "DayorDollar", gff: "Gawlak Family Farms", fppm: "Fort Pierce Purple Martins", babyzora: "BabyZoraGawlak.com" };
  const COLORS = ["#2aa198", "#5b6ee1", "#9b59b6", "#ef8a5b", "#d9534f", "#3b8ed0", "#8a6d3b"];

  if (!document.querySelector("link[data-mgc-fonts]")) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.dataset.mgcFonts = "";
    l.href = "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Oswald:wght@500;600&family=Petit+Formal+Script&display=swap";
    document.head.append(l);
  }

  const root = host.attachShadow({ mode: "open" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const color = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const avatar = (p, small) =>
    `<span class="av${small ? " s" : ""}" style="background:${color(p.id)}">${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : esc((p.name || "?").trim()[0] || "?").toUpperCase()}</span>`;
  function when(ms) {
    const d = new Date(ms), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  }

  async function api(op, body) {
    const res = await fetch(`${API}/${op}`, body === undefined
      ? { credentials: "same-origin", headers: { accept: "application/json" } }
      : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { signedOut = true; render(); throw new Error("signed out"); }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    return data;
  }

  // --- state ------------------------------------------------------------------
  let signedOut = false;
  let sum = null;        // summary
  let view = { name: "inbox" };
  let thread = null;
  let conns = null;
  let flash = null;      // { kind: "err" | "ok", text }
  let draft = { email: "", body: "", reply: "" };
  let poll = null;

  // Our places live under #inbox so the browser's Back button works; other hashes belong to the site.
  function fromHash() {
    const h = location.hash;
    if (!h.startsWith("#inbox")) return { name: "inbox" };
    const [, a, b] = h.slice(1).split("/");
    if (a === "t" && b) return { name: "thread", id: decodeURIComponent(b) };
    if (a === "new") return { name: "new" };
    if (a === "connections") return { name: "connections" };
    if (a === "settings") return { name: "settings" };
    return { name: "inbox" };
  }
  function go(hash) {
    if (location.hash !== hash) location.hash = hash;
    else route();
  }
  async function route() {
    view = fromHash();
    flash = null;
    clearInterval(poll);
    try {
      if (view.name === "inbox") sum = await api("summary");
      else if (!sum) sum = await api("summary");
      if (view.name === "thread") {
        thread = null;
        render();
        thread = await api(`thread?with=${encodeURIComponent(view.id)}`);
        poll = setInterval(refreshThread, 15000);
      }
      if (view.name === "connections") { conns = null; render(); conns = await api("connections"); }
      if (view.name === "inbox") poll = setInterval(refreshSummary, 60000);
    } catch (e) {
      if (!signedOut) flash = { kind: "err", text: e.message };
    }
    render();
  }
  async function refreshThread() {
    if (document.hidden || view.name !== "thread") return;
    try {
      const t = await api(`thread?with=${encodeURIComponent(view.id)}`);
      const changed = !thread || t.messages.length !== thread.messages.length || t.relation !== thread.relation;
      thread = t;
      // Don't redraw under someone who is typing (it would close the phone keyboard).
      if (changed && !root.activeElement) render();
    } catch {}
  }
  async function refreshSummary() {
    if (document.hidden || view.name !== "inbox") return;
    try { sum = await api("summary"); render(); } catch {}
  }

  // --- views ------------------------------------------------------------------
  function bubbles() {
    return `<div class="mgc"><a class="word" href="https://martingawlakcompany.com/">Martin Gawlak Company</a>
      <nav class="bubbles" aria-label="Martin Gawlak Company brands">${BRANDS.map(([id, label, url, img, fit]) =>
        `<a href="${url}" class="${id === SITE ? "here" : ""}" ${id === SITE ? 'aria-current="page"' : ""}><img src="${img}" alt="" class="${fit ? "fit" : ""}" loading="lazy">${esc(label)}</a>`).join("")}</nav></div>`;
  }
  function tabs() {
    const n = sum ? sum.unread : 0;
    const t = (name, label, hash) => `<button class="${view.name === name ? "on" : ""}" data-go="${hash}">${label}</button>`;
    return `<div class="tabs">${t("inbox", `Inbox${n ? `<span class="badge">${n}</span>` : ""}`, "#inbox")}${t("connections", "Connections", "#inbox/connections")}${t("settings", "Settings", "#inbox/settings")}</div>`;
  }
  const flashHtml = () => (flash ? `<div class="${flash.kind}" role="${flash.kind === "err" ? "alert" : "status"}">${esc(flash.text)}</div>` : "");

  function inboxView() {
    const rows = sum.threads.map((t) => {
      const req = t.relation === "request_in";
      return `<button class="row${req ? " req" : ""}${t.unread && !req ? " unread" : ""}" data-go="#inbox/t/${encodeURIComponent(t.with.id)}">
        ${avatar(t.with, true)}<span class="mid"><span class="top"><span class="name">${esc(t.with.name)}${req ? ' <span class="chip">request</span>' : ""}${t.relation === "waiting" ? ' <span class="chip">waiting</span>' : ""}</span><span class="t">${when(t.last.at)}</span></span>
        <span class="line" style="display:block">${t.last.mine ? "You: " : ""}${esc(t.last.body)}</span></span></button>`;
    });
    return `${tabs()}${flashHtml()}<div class="list">${rows.join("") || '<div class="empty">No messages yet. Write to someone you know: you only need their email address.</div>'}</div>
      <button class="big" data-go="#inbox/new">New message</button>`;
  }

  function nameNeeded() {
    return sum && !sum.me.name
      ? `<label for="nm">Your name</label><input type="text" id="nm" required autocomplete="name" maxlength="60" placeholder="Shown to people you write to">`
      : "";
  }

  function newView() {
    const used = sum.newPeopleToday;
    return `<div class="bar"><button class="back" data-go="#inbox" aria-label="Back">&#8592;</button><h1>New message</h1></div>${flashHtml()}
      <form data-form="new">${nameNeeded()}
      <label for="to">To</label><input type="email" id="to" required autocomplete="off" placeholder="Their email address" value="${esc(draft.email)}">
      <div class="note">If you're not connected with this person yet, this goes as a <b>request</b>. They choose whether to answer.<br><span class="small">New people today: ${used.used} of ${used.of} used.</span></div>
      <label for="body">Message</label><textarea id="body" required maxlength="4000">${esc(draft.body)}</textarea>
      <button class="big" type="submit">Send</button>
      <p class="small">Messages stay inside our sites. We never share your email address.</p></form>`;
  }

  function threadView() {
    if (!thread) return `<div class="bar"><button class="back" data-go="#inbox" aria-label="Back">&#8592;</button><h1>&nbsp;</h1></div><p class="small">Loading…</p>`;
    const w = thread.with;
    const firstSite = thread.messages[0] ? SITE_NAMES[thread.messages[0].site] || "" : "";
    const msgs = thread.messages.map((m) => `<div class="bubble${m.mine ? " mine" : ""}">${esc(m.body)}<div class="meta">${when(m.at)}${m.site !== SITE && SITE_NAMES[m.site] ? ` · on ${esc(SITE_NAMES[m.site])}` : ""}</div></div>`).join("");
    let foot = "";
    if (thread.relation === "request_in") {
      foot = `<p class="small">${esc(w.name)} can't send you more until you answer.</p>
        <div class="btns"><button class="go" data-act="accept">Accept</button><button data-act="ignore">Ignore</button><button data-act="block">Block</button></div>
        <p class="small" style="margin-top:14px"><b>Accept</b> connects you on every site: you can then write to each other freely.</p>`;
    } else if (thread.relation === "waiting") {
      foot = `<div class="note">Waiting for ${esc(w.name)} to answer your request.</div>`;
    } else if (thread.canSend) {
      foot = `<form data-form="reply">${nameNeeded()}<textarea id="reply" required maxlength="4000" placeholder="Write a message">${esc(draft.reply)}</textarea>
        <button class="big" type="submit">Send</button></form>
        ${thread.relation === "connected" ? `<p class="small" style="margin-top:14px"><button class="linkish" data-act="block">Block ${esc(w.name)}</button></p>` : ""}`;
    }
    return `<div class="bar"><button class="back" data-go="#inbox" aria-label="Back">&#8592;</button>${avatar(w)}<div><h1>${esc(w.name)}</h1>
      <span class="small">${thread.relation === "connected" ? "Connected" : thread.relation === "request_in" ? `New to you${firstSite ? ` · sent from ${esc(firstSite)}` : ""}` : ""}</span></div></div>
      ${flashHtml()}<div class="msgs">${msgs}</div>${foot}`;
  }

  function connectionsView() {
    if (!conns) return `${tabs()}<p class="small">Loading…</p>`;
    const row = (p, buttons) => `<div class="row">${avatar(p, true)}<span class="mid"><span class="name">${esc(p.name)}</span></span>${buttons}</div>`;
    const sec = (title, list, html, empty) => `<h2>${title}</h2><div class="list">${list.map(html).join("") || `<div class="empty">${empty}</div>`}</div>`;
    return `${tabs()}${flashHtml()}
      ${sec(`Connected (${conns.connected.length})`, conns.connected, (p) => row(p, `<button class="act" data-go="#inbox/t/${encodeURIComponent(p.id)}">Message</button> <button class="linkish" data-act="remove" data-with="${esc(p.id)}">Remove</button>`), "Nobody yet. When someone accepts your message request, or you accept theirs, you're connected on every site.")}
      ${conns.waiting.length ? sec("Waiting for an answer", conns.waiting, (p) => row(p, ""), "") : ""}
      ${conns.blocked.length ? sec("Blocked", conns.blocked, (p) => row(p, `<button class="act" data-act="unblock" data-with="${esc(p.id)}">Unblock</button>`), "") : ""}`;
  }

  function settingsView() {
    const me = sum.me;
    return `${tabs()}${flashHtml()}
      <form data-form="settings">
      <label for="sn">Your name</label><input type="text" id="sn" maxlength="60" autocomplete="name" value="${esc(me.name)}" placeholder="Shown to people you write to">
      <label>Email</label><p style="margin:0 0 12px">${esc(me.email)}<br><span class="small">Never shown to other members.</span></p>
      <label class="check"><input type="checkbox" id="nt" ${me.notify ? "checked" : ""}> Email me when I get new messages</label>
      <button class="big" type="submit">Save</button></form>
      <h2>More</h2>
      <div class="card">Put MGC on your phone: open <a href="https://martingawlakcompany.com/">martingawlakcompany.com</a>, then <b>Share → Add to Home Screen</b> (iPhone) or <b>⋮ → Install app</b> (Android).</div>
      <div class="card"><a href="${ACCOUNTS}/account">Sign-in methods</a> · <a href="${esc(SIGNOUT)}">Sign out</a></div>`;
  }

  function render() {
    if (signedOut) { root.innerHTML = ""; return; }
    let body = "";
    if (!sum) body = flash ? flashHtml() : `<p class="small">Loading…</p>`;
    else if (view.name === "new") body = newView();
    else if (view.name === "thread") body = threadView();
    else if (view.name === "connections") body = connectionsView();
    else if (view.name === "settings") body = settingsView();
    else body = inboxView();
    const me = sum && sum.me;
    root.innerHTML = `<style>${CSS_TEXT}</style><div class="p">${bubbles()}<div class="wrap">
      ${me ? `<div class="hello">${avatar({ id: me.id, name: me.name || me.email, image: me.image })}<div><h1>Hi${me.name ? `, ${esc(me.name.split(" ")[0])}` : ""}</h1><span class="small">${esc(me.email)}</span></div></div>` : ""}
      ${body}</div></div>`;
    const msgs = root.querySelector(".msgs");
    if (msgs && view.name === "thread") msgs.lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  // --- actions ----------------------------------------------------------------
  async function saveName() {
    const nm = root.getElementById("nm");
    if (nm) {
      await api("settings", { name: nm.value });
      sum = await api("summary");
    }
  }
  root.addEventListener("input", (e) => {
    if (e.target.id === "to") draft.email = e.target.value;
    if (e.target.id === "body") draft.body = e.target.value;
    if (e.target.id === "reply") draft.reply = e.target.value;
  });
  root.addEventListener("click", async (e) => {
    const g = e.target.closest("[data-go]");
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    const withId = a.dataset.with || (thread && thread.with.id);
    if (act === "block" && !confirm("Block this person? They won't be told, and they can't write to you.")) return;
    if (act === "remove" && !confirm("Remove this connection? You'd need a new request to write again.")) return;
    try {
      await api("answer", { with: withId, action: act });
      if (act === "ignore" || act === "block") { go("#inbox"); return; }
      if (view.name === "connections") conns = await api("connections");
      else thread = await api(`thread?with=${encodeURIComponent(withId)}`);
      flash = act === "accept" ? { kind: "ok", text: "Connected. You can write to each other freely now." } : null;
    } catch (err) { flash = { kind: "err", text: err.message }; }
    render();
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    const btn = e.target.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      if (form === "new") {
        await saveName();
        const r = await api("send", { email: draft.email, body: draft.body });
        draft.email = draft.body = "";
        go(`#inbox/t/${encodeURIComponent(r.to.id)}`);
        return;
      }
      if (form === "reply") {
        await saveName();
        await api("send", { to: thread.with.id, body: draft.reply });
        draft.reply = "";
        thread = await api(`thread?with=${encodeURIComponent(thread.with.id)}`);
        flash = null;
      }
      if (form === "settings") {
        await api("settings", { name: root.getElementById("sn").value, notify: root.getElementById("nt").checked });
        sum = await api("summary");
        flash = { kind: "ok", text: "Saved." };
      }
    } catch (err) { flash = { kind: "err", text: err.message }; }
    render();
  });
  addEventListener("hashchange", () => { if (location.hash.startsWith("#inbox") || view.name !== "inbox") route(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) (view.name === "thread" ? refreshThread : refreshSummary)(); });

  route();
  if (location.hash.startsWith("#inbox")) host.scrollIntoView({ block: "start" });
}
