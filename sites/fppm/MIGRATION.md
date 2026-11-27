# fppm.us off WordPress

Fort Pierce Purple Martins FC — the `fppm-team-manager` plugin (0.10.17) and
`gff-drive-backup` as fppm.us ran them on SiteGround — ported to a Cloudflare
Worker with a D1 database, the way gawlakfamilyfarms.com was ported. The goal
is a faithful port: same pages, same answers, same emails, checked against the
plugin itself. Fort Pierce Purple Martins is its own club: nothing is shared
with the other sites beyond the method and the sign-in.

## What the live site is

- WordPress 7.1.5 with Twenty Twenty-Five (a block theme): header with the
  crest, the UPSL logo and the navigation (Account · Fort Pierce Purple
  Martins · Go · Roster), the site's Oswald/Lato fonts and a fixed QR-code
  background. Active plugins: fppm-team-manager, gff-drive-backup, Nextend
  Social Login (Google), Wordfence, Wordfence Login Security, SiteGround
  Optimizer / Security / Wizard. WooCommerce is installed but **not active**.
- Pages: `/` (33, `[fppm_register]` then `[fppm_merch]`), `/go/` (42,
  `[fppm_register]`), `/account/` (10, `[fppm_account]`), `/roster/` (102,
  static text: the Fall 2027 staff and the Saturday conditioning).
- The export (2026-11-27): one user (the admin), no members, no waivers. The
  settings are live: prices 10 / 25 / 10%, the waiver at v1.0 with the built-in
  text, the seeded Saturday conditioning, the PayPal store set to **live** with
  a client id, secret, Printful token and a 3-product catalog; the waiver
  Sheet is **not configured** (`fppm_gs_json` empty).
- fppm.us answered 502 to almost every request on 2026-11-27, so the theme
  frame was cut from a local render of the same WordPress on the export
  (`test/wp-real.sh`), not from the live pages.

## The plugin, inventoried

**Shortcodes:** `fppm_register`, `fppm_invite`, `fppm_account` (signed out:
sign-in bar + join form; staff/admin: staff dashboard; incomplete: finish
joining; else the member dashboard), `fppm_merch`.

**template_redirect:** the login gate (1), the completion gate (2), the join
form handler (10). **init:** `?fppm_pwa=manifest|sw`, `?fppm_ics=<id>`, the
seeded conditioning event, Drive Backup's self-scheduling.

**admin-post.php (signed in only):** `fppm_complete`, `fppm_player_invite`,
`fppm_accept_invite`, `fppm_self_delete`, `fppm_admin_delete`,
`fppm_dues_mark`, `fppm_set_status`, `fppm_save_notes`, `fppm_announce`,
`fppm_export_roster` (CSV), `fppm_fetch_catalog`, `fppm_export_waivers`
(CSV), `fppm_sync_waivers`, `fppm_add_event`, `fppm_delete_event`,
`fppm_rsvp`. **admin-ajax.php:** `fppm_shop_create`, `fppm_shop_capture`.

**Admin screens:** Purple Martins → Settings, → Waivers; Tools → GFF Drive
Backup. **wp_head / wp_footer:** the PWA tags and the install pill.

**Mail (wp_mail, plain text):** new member → staff notify address (or the
admin); player invite → the member; Printful failure → staff.

**Data:** no tables of its own. User meta `fppm_*` (type, phone, address,
`fppm_waiver`, `fppm_oath`, `fppm_dues_log`, `fppm_orders`, notes, coupon,
player status/invite/active…), options `fppm_*` (settings, `fppm_events` with
RSVPs, `fppm_announcements`, `fppm_coupon_codes`, `fppm_store_catalog`, …),
transients `fppm_pp_tok_<env>` and `fppm_ord_<order>`. Roles `fppm_member`,
`fppm_staff` (`fppm_manage`); administrators manage too.

**Outside services:** PayPal Orders API (sandbox or live), Printful API,
Google OAuth + Sheets (the waiver mirror).

## The port

| Area | Where | State |
|---|---|---|
| D1 schema, importer | `migrations/`, `scripts/import-wordpress.py` | done, checked (every test run imports the fixture) |
| Join form + handler, finish joining, waiver and oath records, Sheet mirror | `src/fppm/register.ts`, `account.ts`, `waivers.ts` | ported, checked |
| Member dashboard (dues, promo code, invite card, apparel/store, schedule, updates, your info, delete) | `src/fppm/account.ts` | ported, checked |
| Staff dashboard (roster by type, statuses, notes, player invites, dues marking, announcements, CSV export, admin delete) | `src/fppm/staff.ts` | ported, checked |
| Events, RSVPs, Google/Outlook/.ics links, seeded conditioning | `src/fppm/events.ts` | ported, checked (four different clocks) |
| Store: catalog, member discount, PayPal create/capture, Printful order, Fetch catalog | `src/fppm/store.ts` | ported, checked against fakes |
| Settings, Waivers, Drive Backup screens; options.php | `src/fppm/settings.ts`, `src/admin.ts` | ported, checked |
| Ticker, member codes / coupon pool | `src/fppm/core.ts`, `account.ts` | ported, checked |
| Gates (members-only site, finish joining) | `src/fppm/gate.ts`, `src/render/page.ts` | ported, checked |
| PWA (manifest, service worker, head tags, install pill, icons) | `src/fppm/pwa.ts`, `public/wp-content/plugins/fppm-team-manager/assets/` | ported, checked |
| Theme frame + WordPress's template filters | `src/render/` (`scripts/gen-shell.py`) | done; whole pages identical to WordPress's |
| Sign-in (accounts service, 90-day sliding cookie), www redirect, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | `src/sso.ts`, `src/session.ts`, `src/index.ts`, `src/agents.ts` | done, checked |
| GFF Drive Backup (nightly log line, its page) | `src/fppm/settings.ts`, `src/jobs.ts` | ported, checked |

## How the port is checked

`npm test` (MariaDB running: `scripts/db-up.sh`):

- `test/fixture.php` builds `fppm_fixture`: **made-up** members and waivers
  (example.test addresses, 555 numbers) with the live site's settings shape.
  Nothing real is in git; Martin's export stays outside the repo.
- `test/render.parity.ts` (70 cases): plugin expressions run by the plugin
  on a PHP stand-in WordPress (`test/wp.php`) and by the Worker from the same
  fixture must give the same bytes — every shortcode, dashboard, card,
  schedule (at four clocks), calendar link, .ics, the manifest and service
  worker, and the gates.
- `test/actions.parity.ts` (125 steps + 1): every form and handler replayed
  through both; the reply, mail and stored state (users, roles, `fppm_*`
  meta, settings, transients) must match after each step, and every request
  each side sent to PayPal, Printful and Google (signed JWTs included) must
  be identical.
- `test/pages.test.ts` (49 checks): the Worker end to end — frame, gates,
  join post, dispatch, admin, app, guides, redirects, the 90-day renewal,
  the cron, sign-in matching, the importer's extra admin. With
  `FPPM_WP_URL` set (`sh test/wp-real.sh <dir>`, needs the export loaded as
  `fppm_old`), five whole pages are compared with real WordPress's: `/`,
  `/go/`, `/account/` (twice), `/roster/` — identical after the intended
  differences. Screenshots of both at 1280 and 390 px match except the
  password field the join form no longer has.

## Intended differences

1. **Sign-in is the shared accounts service** (email code or Google), not
   WordPress passwords or Nextend's popup: `wp_login_url()` →
   `/auth/login?returnTo=<page>`, `wp_logout_url()` → `/auth/logout`;
   `/wp-login.php` (and Nextend's `?loginSocial=google` links) redirect there.
   An account is matched to its WordPress user by account id, then by email,
   keeping the WordPress id; a new person becomes a `subscriber` (the site's
   default role, as Nextend made them) and is sent to finish joining.
2. **Nextend's Google button** keeps its markup and styles but links to that
   sign-in (which offers Google on its own page); Nextend's scripts are gone.
3. **The join form has no password field**, and the handler no longer
   refuses a short password.
4. **A new member is not signed in by the join handler.** The plugin set the
   login cookie straight away; the Worker sends them to the accounts sign-in
   (`/auth/login?returnTo=/account/?fppm_note=registered`), so whoever typed
   an address must prove it is theirs before getting a session for it.
   Everything else the handler does (account, meta, waiver, oath, dues, code,
   staff email, Sheet) is unchanged.
5. **Credentials are Worker secrets:** `fppm_pp_secret` → `PAYPAL_SECRET`,
   `fppm_printful_token` → `PRINTFUL_TOKEN`, `fppm_gs_json` →
   `GOOGLE_SA_JSON`. Settings shows each as Set / Not set with the command
   that sets it, never a value; options.php does not save them. The PayPal
   client id stays a setting (the page prints it in PayPal's script address).
6. **Nonces** become one same-origin check on every POST (and a same-site
   check on the GET links to CSV exports, Fetch catalog and Sync); the forms
   still carry their nonce fields.
7. **No wp-admin:** Settings, Waivers and Drive Backup are served at their
   wp-admin addresses (and `/admin`) inside a small standalone page, for
   administrators. The WordPress admin bar is not drawn on the pages.
8. **WooCommerce's optional path is off** (`fppm_wc_active()` is false), as
   it was on the live site where WooCommerce is not active; nothing else in
   the plugin's output changes because of it.
9. **GFF Drive Backup** has nothing to back up here (it needs the farm's GFF
   plugin) and logged "SKIPPED" every night; the Worker keeps doing exactly
   that. Its service-account field shows "Not needed on this site" and is
   never stored.
10. **Storage encoding:** PHP-serialized arrays become JSON; an event's RSVPs
    are kept as `[uid, status]` pairs so the order people answered survives
    (a JSON object would reorder numeric keys).
11. **WordPress's endpoints** the theme advertised (feeds, oEmbed, REST, RSD,
    shortlink, generator) are left out of the head.

Plugin behaviour kept as it is, though worth knowing: the event times are
read and shown in UTC (PHP's clock in WordPress), so "next weekly session"
moves on after 09:00 UTC on its day; deleting a member (self or admin)
deletes their waiver record too (the Sheet mirror, when configured, keeps its
copy); the waiver mirror is only as good as its configuration — on the live
site it was never set up, so no waiver ever left WordPress.

## Secrets and resources for production

Cloudflare (made by the main session): Worker `fppm`, D1 `fppm`
(`4daba1bc-a852-4818-90ca-0234ea73f9fe`, migrations not applied yet), a
preview Worker `fppm-preview` (workers.dev, no crons, sign-in off).

Secrets (`wrangler secret put NAME`): `SESSION_SECRET` and `RESEND_API_KEY`
(already set on `fppm`), `SSO_CLIENT_SECRET`, `PAYPAL_SECRET`,
`PRINTFUL_TOKEN`, and `GOOGLE_SA_JSON` only if the waiver Sheet is to be set up.
Var: `SSO_CLIENT_ID` in `wrangler.toml` is a **placeholder** until the
fppm.us sign-in client exists (accounts admin, origin `https://fppm.us`).

Mail: Resend, from "Fort Pierce Purple Martins" <fppm@martingawlakcompany.com>,
replies to hello@martingawlakcompany.com.

**Cron:** one trigger, `1 4 * * *` (the Drive Backup's own WP-Cron time,
04:01 UTC). The account is at the Workers Free limit of 5 (farm 2, Bandturo 1,
DoD 1, zora-ticket-booth 1): **free a slot first** (merge the farm's two
triggers into one, dispatching by time as `src/jobs.ts` does here), or deploy
with `crons = []` until then — the only job writes a "SKIPPED" log line.

## Load the data (when switching)

```
mysql -e 'create database fppm_old character set utf8mb4'
sed 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' fppm-export.sql | mysql fppm_old
python3 -I scripts/import-wordpress.py --db fppm_old > /outside/repo/fppm-import.sql
npx wrangler d1 migrations apply fppm --remote
npx wrangler d1 execute fppm --remote --file /outside/repo/fppm-import.sql
```

The importer finds the table prefix itself, lowercases emails, keeps user
ids, converts serialized arrays to JSON, copies every waiver record value for
value, leaves out the four credential settings (it names any it found), and
adds hello@martingawlakcompany.com as an administrator.

## Still missing / open

- **Two uploads could not be fetched** (fppm.us answered 502):
  `wp-content/uploads/2026/07/United_Premier_Soccer_League_logo.svg_-150x150.webp`
  (the header's UPSL logo) and `wp-content/uploads/2026/07/fppm-us-qr-soccer-gold.png`
  (the page background). Copy them into `public/wp-content/uploads/2026/07/`
  from SiteGround. The crest's sizes were made from the plugin's own
  `icon-512.png` (the same file as the upload), and the site fonts were taken
  from Google Fonts by their file names (Oswald from a newer release than the
  site's upload may be); replacing all of `wp-content/uploads/` with
  SiteGround's copy makes them exact.
- The live store is set to PayPal **live** with real credentials; Fetch
  catalog and checkout will use them once the secrets are set.
- Not ported: WooCommerce reconciliation (`fppm_wc_reconcile_dues`, inactive),
  WP-CLI, Wordfence and SiteGround's plugins (security and caching are
  Cloudflare's job now).
