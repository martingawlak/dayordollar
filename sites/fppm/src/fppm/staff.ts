/**
 * Section 8 (staff) and 9: the staff dashboard — counts, export, recruit
 * link, team-update composer, schedule, store, the roster by type with
 * status, dues marking, notes, player invites and (administrators) delete —
 * and the admin-post handlers behind it, plus a member deleting their own
 * account. Every handler checks the same capability the plugin checked; the
 * nonces become the Worker's same-origin check.
 */
import { type Ctx, adminUrl, can, homeUrl, logoutUrl, meta, opt, setMeta, setOpt } from "../ctx";
import { esc, escTextarea, escUrl, gmdate, numberFormat, phpInt, truthy } from "../php";
import { sanitizeKey, sanitizeTextareaField, sanitizeTextField } from "../wpfn";
import { csvLine, currentMysql, deleteUser, DieReply, FileReply, RedirectReply, sendMail, addQueryArg } from "../wp";
import type { AjaxCtx } from "../ajax";
import { cookie } from "../session";
import { SESSION_COOKIE } from "../session";
import {
  assetUrl, canManage, displayName, duesMark, duesOpen, flashHtml, isArr, redirectNote, statusLabel, STATUSES, str, styles, teamName, typeLabel, userCanId,
} from "./core";
import { collectMembers, type MemberRow } from "./members";
import { joinUrl } from "./gate";
import { scheduleStaffHtml } from "./events";
import { apparelBlock, installCard, inviteCard, playerActive, playerInvitePending, tickerHtml } from "./account";
import { escJs } from "./store";
import { nonceField, nonceUrl, selected } from "./ui";
import { nonce } from "../ctx";

export async function staffDashboard(c: Ctx): Promise<string> {
  const rows = await collectMembers(c);
  const players = rows.filter((r) => r.type === "player"), sups = rows.filter((r) => r.type === "supporter"), fans = rows.filter((r) => r.type === "fan");
  let owed = 0;
  for (const r of rows) owed += r.owe;
  const csvUrl = nonceUrl(adminUrl(c, "admin-post.php?action=fppm_export_roster"), "fppm_export_roster");
  let o = styles(c);
  o += '<div class="fppm-wrap">';
  o += '<h2 class="fppm-h"><img class="fppm-crest-img" src="' + escUrl(assetUrl(c, "icon-192.png")) + '" alt=""> ' + esc(teamName(c)) + " — Staff</h2>";
  o += '<p class="fppm-sub">' + rows.length + " members · " + players.length + " players · " + sups.length + " supporters · " + fans.length + " fans · <strong>$" + esc(numberFormat(owed, 2)) + "</strong> outstanding</p>";
  o += await tickerHtml(c);
  o += flashHtml(c);
  o += installCard(c);
  o += '<div class="fppm-card"><div class="fppm-actions">';
  o += '<a class="fppm-btn fppm-btn--ghost" href="' + escUrl(csvUrl) + '">⬇️ Export roster CSV</a>';
  o += '<a class="fppm-btn fppm-btn--ghost" href="' + escUrl(joinUrl(c)) + '" target="_blank" rel="noopener">Open recruit link</a>';
  o += '</div><p class="fppm-muted" style="margin-top:.6em;">Share the join link with anyone — they can sign up as a fan, player, or supporter.</p></div>';
  o += inviteCard(c);
  o += '<div class="fppm-card"><h3>Post a team update</h3>';
  o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '">';
  o += '<input type="hidden" name="action" value="fppm_announce">';
  o += nonceField(c, "fppm_announce");
  o += '<div class="fppm-field"><label>Title</label><input type="text" name="fppm_a_title" required></div>';
  o += '<div class="fppm-field"><label>Message</label><textarea name="fppm_a_body" rows="3" required></textarea></div>';
  o += '<button class="fppm-btn" type="submit">Post update</button>';
  o += "</form></div>";
  o += await scheduleStaffHtml(c);
  o += await apparelBlock(c);
  o += await rosterSection(c, "Players", players, true);
  o += await rosterSection(c, "Supporters", sups, false);
  o += await rosterSection(c, "Fans", fans, false);
  o += '<script>var fppmAdminPost="' + escJs(adminUrl(c, "admin-post.php")) + '",fppmHome="' + escJs(homeUrl(c, "/")) + '";'
    + 'function fppmInvite(b){var u=b.dataset.uid,n=b.dataset.nonce,nm=b.dataset.name||"";'
    + 'var m=(nm?("Hey "+nm+"! "):"")+"You\'re invited to join the ' + escJs(teamName(c)) + '. Sign up and accept your player invite at "+fppmHome;'
    + 'if(navigator.share){navigator.share({title:"' + escJs(teamName(c)) + '",text:m,url:fppmHome}).catch(function(){});}'
    + 'else{try{navigator.clipboard.writeText(m);}catch(e){}alert("Invite text (copied to clipboard):\\n\\n"+m);}'
    + 'var d=new URLSearchParams({action:"fppm_player_invite",uid:u,_wpnonce:n});'
    + 'fetch(fppmAdminPost,{method:"POST",credentials:"same-origin",body:d}).then(function(){b.textContent="Invite sent ✓";b.disabled=true;}).catch(function(){});}</script>';
  o += '<p class="fppm-muted"><a href="' + escUrl(logoutUrl()) + '">Sign out</a></p>';
  o += "</div>";
  return o;
}

async function rosterSection(c: Ctx, title: string, rows: MemberRow[], isPlayer: boolean): Promise<string> {
  let o = '<div class="fppm-card"><h3>' + esc(title) + ' <span class="fppm-badge">' + rows.length + "</span></h3>";
  if (!rows.length) return o + '<p class="fppm-muted">None yet.</p></div>';
  o += '<table class="fppm-table"><thead><tr><th>Name</th><th>Contact</th>';
  if (isPlayer) o += "<th>Pos / #</th><th>Status</th>"; else if (title === "Supporters") o += "<th>Shirt</th>";
  o += "<th>Dues</th><th>Notes</th></tr></thead><tbody>";
  for (const r of rows) {
    const uid = r.id;
    o += "<tr>";
    o += "<td><strong>" + esc(r.name) + "</strong></td>";
    o += '<td><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" + (truthy(r.phone) ? "<br>" + esc(r.phone) : "") + (truthy(r.address) ? '<br><span class="fppm-muted">' + esc(r.address) + "</span>" : "") + "</td>";
    if (isPlayer) {
      o += "<td>" + esc((truthy(r.pos) ? r.pos : "—") + (truthy(r.jersey) ? " · #" + r.jersey : "")) + "</td>";
      o += "<td>" + statusControl(c, uid, r.status) + "</td>";
    } else if (title === "Supporters") {
      o += "<td>" + esc(truthy(r.shirt) ? r.shirt : "—") + "</td>";
    }
    o += "<td>";
    if (r.owe > 0) {
      o += '<span class="fppm-badge fppm-badge--owe">$' + esc(numberFormat(r.owe, 2)) + "</span>";
      for (const e of await duesOpen(c, uid)) {
        o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '" class="fppm-inline" style="display:block;margin-top:.3em;">';
        o += '<input type="hidden" name="action" value="fppm_dues_mark">';
        o += '<input type="hidden" name="uid" value="' + esc(uid) + '">';
        o += '<input type="hidden" name="num" value="' + esc(e.num) + '">';
        o += '<input type="hidden" name="paid" value="1">';
        o += nonceField(c, "fppm_dues_" + uid + "_" + str(e.num));
        o += '<button class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" type="submit">Mark $' + esc(e.amount) + " paid</button>";
        o += "</form>";
      }
    } else {
      o += '<span class="fppm-badge fppm-badge--paid">Paid</span>';
    }
    o += "</td>";
    o += "<td>" + (await notesControl(c, uid)) + (await playerInviteControl(c, uid)) + (await adminDeleteControl(c, uid)) + "</td>";
    o += "</tr>";
  }
  return o + "</tbody></table></div>";
}

function statusControl(c: Ctx, uid: number, current: string): string {
  let o = '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '">';
  o += '<input type="hidden" name="action" value="fppm_set_status">';
  o += '<input type="hidden" name="uid" value="' + esc(uid) + '">';
  o += nonceField(c, "fppm_status_" + uid);
  o += '<select name="status" onchange="this.form.submit()" style="padding:.3em;border-radius:8px;border:1px solid var(--fppm-line);">';
  for (const [k, lab] of Object.entries(STATUSES)) o += '<option value="' + esc(k) + '" ' + selected(current, k) + ">" + esc(lab) + "</option>";
  return o + "</select></form>";
}
async function notesControl(c: Ctx, uid: number): Promise<string> {
  const notes = await meta(c, uid, "fppm_notes");
  let o = '<details class="fppm-det"><summary>' + (truthy(notes) ? "📝 notes" : "+ note") + "</summary>";
  o += '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + '" style="margin-top:.4em;">';
  o += '<input type="hidden" name="action" value="fppm_save_notes">';
  o += '<input type="hidden" name="uid" value="' + esc(uid) + '">';
  o += nonceField(c, "fppm_notes_" + uid);
  o += '<textarea name="notes" rows="3" style="width:220px;">' + escTextarea(str(notes)) + "</textarea><br>";
  o += '<button class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;margin-top:.3em;" type="submit">Save note</button>';
  return o + "</form></details>";
}
async function playerInviteControl(c: Ctx, uid: number): Promise<string> {
  if (!(await canManage(c))) return "";
  if (await playerActive(c, uid)) return '<div class="fppm-muted" style="font-size:.75rem;margin-top:.3em;">✓ active player</div>';
  if (await playerInvitePending(c, uid)) return '<div class="fppm-muted" style="font-size:.75rem;margin-top:.3em;">⏳ invite sent</div>';
  return '<button type="button" class="fppm-btn fppm-btn--ghost" style="padding:.2em .6em;font-size:.75rem;margin-top:.3em;" onclick="fppmInvite(this)" data-uid="' + Math.trunc(uid)
    + '" data-nonce="' + esc(nonce("fppm_pinvite_" + uid)) + '" data-name="' + esc(await displayName(c, uid)) + '">Invite as player</button>';
}
async function adminDeleteControl(c: Ctx, uid: number): Promise<string> {
  if (!can(c, "delete_users")) return "";
  if (uid === c.uid || (await userCanId(c, uid, "manage_options"))) return "";
  const name = escJs(await displayName(c, uid));
  let o = '<form method="post" action="' + escUrl(adminUrl(c, "admin-post.php")) + "\" style=\"margin-top:.4em;\" onsubmit=\"return confirm('Permanently delete " + name + "? This cannot be undone.');\">";
  o += '<input type="hidden" name="action" value="fppm_admin_delete">';
  o += '<input type="hidden" name="uid" value="' + esc(uid) + '">';
  o += nonceField(c, "fppm_admin_delete_" + uid);
  o += '<button class="fppm-btn" style="background:var(--fppm-ink);padding:.2em .6em;font-size:.75rem;" type="submit">Delete</button>';
  return o + "</form>";
}

/* ---- handlers (admin-post.php) ---- */
const postInt = (c: AjaxCtx, k: string) => (c.post[k] !== undefined ? phpInt(str(c.post[k])) : 0);

export async function hPlayerInvite(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const uid = postInt(c, "uid");
  if (uid) {
    await setMeta(c, uid, "fppm_player_invite", { pending: 1, by: c.uid, at: currentMysql(c) });
    const u = await c.env.DB.prepare("select email from wp_users where id = ?").bind(uid).first<{ email: string }>();
    if (u) {
      await sendMail(c.env, u.email, "[FPPM] You're invited to join as a player",
        "You've been invited to join the " + teamName(c) + " as a player.\n\nLog in to your account and click \"Accept player invite\" to activate your player account:\n" + homeUrl(c, "/account/") + "\n\nGo Purple Martins!");
    }
    return redirectNote(c, "invited");
  }
  return redirectNote(c, "err");
}

/** fppm_h_self_delete(): a member deletes their own account (never an administrator's), and is signed out. */
export async function hSelfDelete(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  const uid = c.uid;
  if (!uid) return new DieReply("Not signed in.");
  if (can(c, "manage_options")) return new DieReply("Admin accounts cannot be self-deleted here.");
  await deleteUser(c, uid);
  return new RedirectReply(addQueryArg({ fppm_bye: "1" }, homeUrl(c, "/")), [cookie(SESSION_COOKIE, "", 0)]);
}

export async function hAdminDelete(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!can(c, "delete_users")) return new DieReply("Not allowed.");
  const uid = postInt(c, "uid");
  if (uid && uid !== c.uid && !(await userCanId(c, uid, "manage_options"))) {
    await deleteUser(c, uid);
    return redirectNote(c, "deleted");
  }
  return redirectNote(c, "err");
}

export async function hDuesMark(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const uid = postInt(c, "uid");
  const num = c.post.num !== undefined ? sanitizeTextField(str(c.post.num)) : "";
  const paid = c.post.paid !== undefined && str(c.post.paid) === "1";
  await duesMark(c, uid, num, paid, c.uid);
  return redirectNote(c, paid ? "duespaid" : "duesopen");
}

export async function hSetStatus(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const uid = postInt(c, "uid");
  const status = c.post.status !== undefined ? sanitizeKey(str(c.post.status)) : "";
  if (uid && Object.prototype.hasOwnProperty.call(STATUSES, status)) {
    await setMeta(c, uid, "fppm_player_status", status);
    return redirectNote(c, "statusset");
  }
  return redirectNote(c, "err");
}

export async function hSaveNotes(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const uid = postInt(c, "uid");
  const notes = c.post.notes !== undefined ? sanitizeTextareaField(str(c.post.notes)) : "";
  if (uid) await setMeta(c, uid, "fppm_notes", notes);
  return redirectNote(c, "noted");
}

export async function hAnnounce(c: AjaxCtx): Promise<RedirectReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  const title = c.post.fppm_a_title !== undefined ? sanitizeTextField(str(c.post.fppm_a_title)) : "";
  const body = c.post.fppm_a_body !== undefined ? sanitizeTextareaField(str(c.post.fppm_a_body)) : "";
  if (title === "" || body === "") return redirectNote(c, "err");
  const raw = opt(c, "fppm_announcements", []);
  let list: unknown[] = Array.isArray(raw) ? raw : isArr(raw) ? Object.values(raw) : [];
  list.push({ title, body, at: currentMysql(c), by: c.uid });
  if (list.length > 50) list = list.slice(-50);
  await setOpt(c, "fppm_announcements", list);
  return redirectNote(c, "announced");
}

export async function hExportRoster(c: AjaxCtx): Promise<FileReply | DieReply> {
  if (!(await canManage(c))) return new DieReply("Not allowed.");
  let out = csvLine(["name", "type", "status", "email", "phone", "address", "city", "state", "zip", "position", "jersey", "shirt", "dues_outstanding"]);
  for (const r of await collectMembers(c)) {
    out += csvLine([r.name, typeLabel(r.type), r.type === "player" ? statusLabel(r.status) : "", r.email, r.phone, await meta(c, r.id, "fppm_address"), await meta(c, r.id, "fppm_city"),
      await meta(c, r.id, "fppm_state"), await meta(c, r.id, "fppm_zip"), r.pos, r.jersey, r.shirt, numberFormat(r.owe, 2).replace(/,/g, "")]);
  }
  return new FileReply(["Content-Type: text/csv; charset=utf-8", "Content-Disposition: attachment; filename=fppm-roster-" + gmdate("Y-m-d", c.now) + ".csv"], out);
}
