# gawlakfamilyfarms.com off WordPress

The Gawlak Family Farms plugin (`gff-customer-registration` 3.37.0, the
version live on gawlakfamilyfarms.com) ported to a Cloudflare Worker with a
D1 database, the same way bandturo.com and dayordollar.com were ported. The
goal is a faithful port: same pages, same answers, same emails, checked
against the plugin itself. Gawlak Family Farms is its own business: nothing
here is shared with DayorDollar beyond the method.

## What the live site is

- WordPress with the Astra theme and Beaver Builder; WooCommerce is installed
  (its login form sits on the account page) but sells nothing.
- 9 accounts: the admin, 5 `gff_customer`, 1 `gff_lead`, 2 `gff_staff`.
- Three published pages, all Beaver Builder layouts:
  - **Home** (3568, `gawlak-family-farms`): `[gff_zora_display]`, the express
    sign-up form `[gff_express_start]` `[gff_express_email]` `[gff_consult]`
    `[gff_agreement]` `[gff_express_submit]` `[gff_form_end]`, and
    `[gff_convince]`.
  - **Account** (4049): `[aerial_timelapse]` (another plugin, not received
    yet), `[gff_account]`, `[woocommerce_my_account]`, a Spread button.
  - **Garden** (4086): `[gff_garden_invite]`.
- Two more plugins are pending from Martin: `aerial-timelapse` and
  `gff-drive-backup` (its settings, `gff_dbk_*`, are in the database).

## The plugin, inventoried

**Shortcodes (33).** On published pages: the home page's eight above,
`gff_account`, `gff_garden_invite`. Registered but not on a published page:
`gff_form_start`, `gff_timeline`, `gff_pitch`, `gff_crops`, `gff_farm_builder`,
`gff_details`, `gff_address`, `gff_start_date`, `gff_login`, `gff_workshop`
(retired, prints nothing), `gff_tower_consult`, `gff_tower_agreement`,
`gff_addons`, `gff_submit`, `gff_tower_start`, `gff_tower_count`,
`gff_tower_email`, `gff_tower_submit`, `gff_lead_capture`, `gff_registration`
(legacy all-in-one), `gff_my_farm`, `gff_account_planner`, `gff_start`.

**Form posts (the 'wp' hook, `gff_reg_maybe_handle_submit`).** A sign-up page
posts to itself; the handler runs before the page renders and leaves an alert
in `$gff_reg_state`: the full flow (`gff_reg_submit`), the lead flow
(`gff_lead_submit`), the express flow (`gff_express_submit`, the home page)
and the tower flow (`gff_tower_submit`).

**AJAX actions.** Signed in: `gff_crop_toggle`, `gff_planner_autosave`.
Signed in and out: `gff_v34_consent`.

**admin-post.php handlers (the client admin, 14).** `gff_export_seeds_mailer`,
`gff_export_clients` (CSV), `gff_send_invoice_row`, `gff_inv_mark_paid`,
`gff_route_toggle`, `gff_dispatch_consult`, `gff_dispatch_assign`,
`gff_dispatch_forward`, `gff_client_toggle_active`, `gff_client_save_notes`,
`gff_lead_make_customer`, `gff_client_delete`, `gff_client_setclass`,
`gff_send_garden_invite`. Each ends in `wp_safe_redirect()`.

**Admin screens.** "GFF Clients" (`gff_reg_admin_page`) and "GFF Settings"
(`gff_reg_settings_page`, with the payment-method and message-recipient
fields); the user-profile panels (add-ons, account, invoices, v33 billing,
phone) saved on `personal_options_update` / `edit_user_profile_update`.

**Scheduled job (WP-Cron).** `gff_v33_cron`, daily: the invoice cycle.

**Roles.** `gff_customer`, `gff_lead`, `gff_staff` (with `gff_view_clients`).

**Mail.** 11 `wp_mail()` calls (invoices, dispatch, garden invites,
three-sisters requests, owner notes), most as HTML with a `Reply-To:`, plus
WordPress's own new-user email to the admin after a sign-up.

**Data.** No tables of its own: everything is user meta (`gff_*`, about 80
keys, plus `first_name`/`last_name`) and options (`gff_*`: invoice counter,
geocode and route caches, dispatch status, consent queue, payment handles);
one transient family (`gff_consent_<token>`).

**Outside services.** Google geocoding (key in `gff_google_geocode_key`),
Nominatim (fallback geocoder) and OSRM (driving routes), for the dispatch and
route screens. PayPal only as fixed payment links (no API).

## Secrets

Never copied into D1 (`scripts/import-wordpress.py` leaves them out):

| WordPress | Worker |
|---|---|
| `gff_google_geocode_key` option | `GOOGLE_GEOCODE_KEY` secret |
| `gff_dbk_sa_json` (Drive backup plugin's service-account key) | `GDRIVE_SA_JSON` secret: `wrangler secret put GDRIVE_SA_JSON < key.json` |
| user passwords, session tokens, Site Kit tokens | not carried over (sign-in moves to the accounts service) |

Plus the Worker's own: `SSO_CLIENT_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`,
and the shop's `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (below).

## Intended differences

Everything else is compared byte for byte by the bench. These spots differ by
decision and the bench skips exactly them:

1. **Sign-in is the shared accounts service** (as on bandturo.com and
   dayordollar.com): `/auth/login` (email code or Google) instead of
   WordPress passwords and the WooCommerce login form. `wp_login_url()` points
   there; the plugin's password fields (`[gff_login]`, the full and lead
   flows) leave the forms when those are ported.
2. **New users have no password.** Where the plugin called `wp_insert_user()`
   with a password (the express flow gives a random one), the Worker creates
   the `wp_users` row by email with no password. The PHP stand-in's
   `wp_insert_user()` likewise stores none, so the bench compares the rest.
3. **Nonces** become one same-origin check on every POST (the form still
   carries its nonce field, and a post without it is still refused, as the
   plugin did).
4. **Emails are stored as typed and matched case-insensitively**, as MySQL's
   collation did; the importer lowercases the existing ones so the accounts
   service can match them.

5. **`[gff_login]` prints nothing.** It held only the two password fields;
   the full flow ignores `gff_pass` / `gff_pass2` and no longer refuses a
   short or mismatched password.
6. **Per-render ids** (`[gff_farm_builder]`'s `md5( uniqid() )` suffix) come
   from a per-request counter instead of the clock: they only have to be
   unique on the page. The test stand-in does the same.
7. **Garden-invite links** are checked with `wp_hash()`, which needs the live
   site's `wp_salt( 'auth' )` (AUTH_KEY . AUTH_SALT from wp-config.php) as the
   Worker secret `WP_AUTH_SALT`; without it, links sent before the move stop
   working and the client admin sends fresh ones.
8. **`[gff_start]`'s `note`** went through `wp_kses_post()`; it comes from the
   page's own shortcode attributes, so the Worker prints it as given.
9. **The account page's guest view says "Sign in".** The plugin's "Log in
   with WordPress" button and its "Prefer Google? Use the Google button on the
   login page" hint described WordPress's login. The button now reads "Sign
   in" and the hint "Sign in with a code sent to your email, or with Google."
   (what the accounts sign-in offers). The bench rewrites exactly that spot.
10. **The client admin has no wp-admin around it.** GFF Clients, GFF
    Settings and the user profile are served at their wp-admin addresses
    (`/wp-admin/admin.php?page=gff-clients`, `…?page=gff-settings`,
    `/wp-admin/user-edit.php?user_id=N`, `/wp-admin/profile.php`; also
    `/admin`) with the plugin's own markup inside a small standalone page.
    A profile shows and saves only the plugin's panels: WordPress's own
    fields (name, email, password) now belong to the accounts service. The
    GFF Settings form posts to `/wp-admin/options.php`, which applies the
    plugin's registered sanitize callbacks as WordPress did.
11. **The Google geocoding key** is the `GOOGLE_GEOCODE_KEY` secret, so it
    is not a setting the screens show or save.

Four plugin quirks the port keeps as they are: the garden-invite email's
subject ends in the 16 characters `\xF0\x9F\x8C\xB1` (the emoji's bytes in
a single-quoted PHP string, never decoded); the GFF Clients CSV writes
whatever text is stored in `gff_farm_layout`; the dashboard's export link is
`esc_url( wp_nonce_url() )`, which double-escapes its `&` (harmless — nothing
checks the nonce); and four helpers nothing calls (`gff_active_toggle_form`,
`gff_lead_convert_form`, `gff_route_toggle_btn`, `gff_dash_service_summary`)
are not ported, though their handlers are.

## Aerial Timelapse (plugin 1.1.0)

The account page's `[aerial_timelapse]`: a per-customer overhead timelapse
of public-domain USDA NAIP aerial photos (via Microsoft Planetary Computer),
geocoded by the US Census geocoder. No keys.

- **Data.** One user meta record per customer, `at_property` (address,
  point, frames as provider image URLs, glow state, next weekly check);
  `at_last_check` (the last bulk sweep). Users 1 and 33 have one today. The
  bulk-check token `at_check_token` is a credential: it becomes the
  `AT_CHECK_TOKEN` secret (fixture: a test value). The address form is
  prefilled from WooCommerce's `billing_*` meta, which the importer now
  carries (none is set today).
- **Ported** (`src/aerial/`): the shortcode, the player's assets (served at
  the plugin's own path under `public/`), the REST API at its own paths
  (`GET|POST /wp-json/aerial-timelapse/v1/property`, `GET|POST
  …/check-updates`) with WordPress's argument checks and error shapes, the
  NAIP source, the geocode-and-build fetcher, the checker (on sign-in: the
  `wp_login` hook runs after the accounts sign-in; and the bulk sweep), and
  the staff screens: Settings → Aerial Timelapse, the profile section, its
  save and notice (`settingsPage`, `profileFields`, `saveProfile`,
  `notices`, for the client admin's screens to call).
- **Checked** by 46 render cases (shortcode signed out/in/staff, every REST
  answer and the stored state after it, the sign-in check, the sweep, the
  staff screens), with fake geocoder and catalog answers (`test/aerial.fake.ts`).
- **In the client admin** (`src/admin/route.ts`): Settings → Aerial Timelapse
  at `/wp-admin/options-general.php?page=aerial-timelapse` ("Run check now"
  is a link, so it runs only when followed from the site's own pages: the
  Worker's stand-in for its nonce); the address field on every profile and
  its save, in WordPress's hook order (the site loads `aerial-timelapse`
  first, alphabetically: its field comes before the GFF panels and its save
  runs after the priority-5 invoice fields, before the rest); its error
  notice on every admin screen, with the GFF pending-consents notice
  (`gff_v34_pending_notice`) after it. Checked by the `aerial` actions
  steps, through the same profile/save/notice paths as the GFF panels, with
  `at_*` user meta and options in the compared state.

Intended differences:

10. **No WP-CLI.** `wp aerial-timelapse check` / `token` have no Worker
    equivalent; the REST sweep does the same. The settings page's "Option B
    — WP-CLI" block (which printed the server's path) is gone; the bench
    removes exactly that block from the plugin's output.
11. **REST sign-in.** WordPress's cookie auth needed the `X-WP-Nonce` header
    (the player sends `atConfig.nonce`); the Worker trusts its session cookie
    on GET and on a same-origin POST, as for admin-ajax.php. Application
    passwords (for a future native app) are not offered.
12. **Frames stay with the provider.** The plugin's optional
    `at_store_frames` filter (download frames into uploads) was never turned
    on and has no Worker hook; storing them would take an R2 binding, as on
    dayordollar.com. Without it, `AT_Property::delete` has no files to remove.

## GFF Drive Backup (plugin 1.x, `src/admin/drive.ts`)

Every night at 12:01 AM site time the customer list (33 columns) replaces the
first tab of a Google Sheet and paid invoices replace a "Paid Invoices" tab,
signed in as a Google service account. Ported whole: the row builders, the
RS256 JWT (WebCrypto RSASSA-PKCS1-v1_5 SHA-256, which is deterministic: the
same key and claims give the same bytes as the plugin's `openssl_sign`), the
token exchange, the Sheets calls and their error messages, the
`gff_dbk_last_log` line, and Tools → GFF Drive Backup
(`/wp-admin/tools.php?page=gff-drive-backup`) with "Run backup now".

- **Schedule.** `gff_dbk_daily_event` runs from its own Cron Trigger,
  `1 4 * * *`: the site's clock is `gmt_offset` -4 with no timezone string,
  so 12:01 AM site time is 04:01 UTC all year (WordPress does not move a
  fixed offset for daylight saving either). `src/jobs/index.ts` `CRON_HOOKS`
  maps each trigger to its jobs; after a run the next time is written to
  `cron_next:gff_dbk_daily_event`, which the page shows as "Next run".
- **The key is a secret** (intended difference). The page shows whether
  `GDRIVE_SA_JSON` is set and the command that sets it, never the JSON, and
  its form has no key field; the folder and Sheet ID still save through
  options.php. The key must be the service-account file Google gives
  (PKCS#8 "BEGIN PRIVATE KEY"), which is what the plugin needed too.
- **Checked** by the `drive` steps (a key generated for each run, Google's
  token and Sheets endpoints faked, the fake checking every JWT signature
  with the public half): not configured, success, the tab already there,
  run now, clear refused, write refused, tab not addable, token refused, key
  missing, key unusable, the settings form (staff and admin), Sheet removed.
  Every request both sides send to Google (method, URL, Authorization, body:
  the signed assertion included) must be identical, and so must the log.

## The shop (Stripe), built 2026-11-27

Not a port: Martin's decision is to carry the WooCommerce shop over (one
product, the Legacy Starter Deck, $60), sold with Stripe, with one customer
across all his sites. `src/shop/stripe.ts`, `catalog.ts`, `shop.ts` and
`pages.ts` are the same files as dayordollar.com's (keep the copies
identical); `src/shop/gff.ts` is this site's part.

- **Catalogue** — `src/shop/catalog.gen.ts`, generated from the old Woo data
  (`scripts/gen-shop-catalog.py --db gff_old --prefix svz_ --origin
  https://gawlakfamilyfarms.com --site gawlakfamilyfarms.com`): product 3634,
  a simple product, $60.00, shipped (not virtual). Prices are only ever read
  from here.
- **Pages** — `/shop/` and `/product/gawlak-family-legacy-starter-deck-100-cards/`
  (the live URL), in WooCommerce's markup inside the Garden page's frame
  (its one layout module holds the shop instead; body classes
  `woocommerce woocommerce-page`). WooCommerce's stylesheets don't come along,
  so `gff.ts` carries the dozen rules the markup needs. "Add to cart" becomes
  **Buy now**, posting to `/shop/checkout` (same-origin only). Also
  `/shop/thanks/` and `/account/orders/`.
- **Checkout** — a Stripe Checkout Session. Signed in: the person's shared
  Stripe Customer (`metadata.mgc_account` = their accounts-service id; the
  one dayordollar.com made is found and reused), saving the card offered and
  saved cards shown, US shipping collected and kept on the Customer. A guest
  pays with only the email Stripe asks for. Metadata on the session and the
  payment: `site`, `sku`, `product`, `variation` (empty), `quantity`,
  `mgc_account`.
- **Orders** — `POST /shop/stripe-webhook` (signature checked: HMAC-SHA256,
  5-minute tolerance), `checkout.session.completed` for this site's paid
  sessions only: one `shop_orders` row per session (migration 0003; a
  repeated event records nothing). No automatic fulfilment: the row is
  `needs_fulfilment` and the deck ships by hand, as on WooCommerce. The buyer
  gets a plain receipt with the shipping address; the admin (`admin_email`)
  a notice.
- **"Your orders"** (`/account/orders/`) — the person's completed Checkout
  Sessions from Stripe, by their shared Customer, so every site's orders
  (martingawlakcompany.com's included) show in one list; Stripe is the one
  place that sees them all, and each site's D1 knows only its own. If Stripe
  can't be asked, this site's `shop_orders` are shown. Looking never creates
  a Customer. Not linked from the Account page yet (see the open question on
  `[woocommerce_my_account]`, the natural place for it).
- **Tests** — `npx tsx test/shop.test.ts` (also in `npm test`): a fake
  Stripe; session parameters, reusing a Customer another site made, the
  guest path, the signature, recording once, other sites' sessions left
  alone, the orders list and its fallback, and the pages.

**Secrets:** `STRIPE_SECRET_KEY` — a restricted key with **Customers:
Write** (includes read; the lookup is a search) and **Checkout Sessions:
Write** (includes read: the orders list). Nothing else.
`STRIPE_WEBHOOK_SECRET` — the signing secret of this site's webhook endpoint,
which is created in the dashboard.

## How the port is checked

- `test/fixture.sh` builds `gff_fixture` from `gff_old` (Martin's export),
  with credentials removed or replaced. Real customer data: it stays in local
  MariaDB and is never committed.
- `test/render.parity.ts` + `render.cases.ts`: plugin expressions evaluated by
  the plugin (`test/fn-php.php` on the stand-in WordPress in `test/wp.php`)
  and by the port, from the same data, must give the same bytes; with
  `checkAssets`, the enqueued scripts and styles too.
- `test/actions.parity.ts` + `actions.steps.ts`: requests replayed through
  both (form posts, AJAX, admin-post); the reply, the mail (with headers) and
  the stored state (users and roles, user meta, options, transients) must
  match after every step.
- `scripts/gen-templates.php` captures the plugin's fixed markup with
  sentinel holes; the port fills the holes.

Run: `npm test` (or `npx tsx test/render.parity.ts [filter]`).

## Status

| Area | State |
|---|---|
| Bench, fixture, importer, D1 schema | done |
| Site-wide assets (`gff_reg_register_assets`: styles, fonts, validation JS) | ported, checked |
| Home page shortcodes (8) | ported, checked (19 render cases) |
| Express sign-up post (`gff_reg_handle_express`) | ported, checked (15 steps) |
| Catalogues and prices (crops, add-ons, bundle, reservation options) | ported, checked |
| Full / lead / tower sign-up posts | ported, checked (40 steps with express) |
| `[gff_login]` | ported (prints nothing: intended difference 5) |
| `[gff_account]`, `[gff_my_farm]`, `[gff_account_planner]`, `[gff_farm_builder]`, their page posts, and the AJAX `gff_planner_autosave` / `gff_crop_toggle` | ported, checked (render + steps); the admin/staff view of the account page is the dispatch dashboard (with dispatch) |
| `[gff_garden_invite]` | ported, checked; `gff_send_garden_invite` is with the client admin |
| Client admin: GFF Clients, GFF Settings, profile panels, admin-post handlers, CSV export, admin notices | ported, checked (`src/admin`, @admin/@post/@options steps) |
| Invoices and the daily `gff_v33_cron` | ported, checked |
| Dispatch and routes (geocoding, OSRM), the staff dashboard | ported, checked |
| Consent flow (`gff_v34_consent`, `[gff_start]`, the token claim helper) | ported, checked |
| Page shell (Astra + Beaver Builder layouts for the three pages), routes, Worker entry | not yet |
| `gff-drive-backup`: the nightly Sheet export, its settings page, the last-run log | ported, checked (below) |
| The shop (the Legacy Starter Deck, Stripe Checkout, orders, "Your orders") | built, tested against a fake Stripe (below) |

## Decided by Martin

- 2026-11-27: customers sign in with an email code or Google (the shared
  accounts service), not passwords. Accounts, farm details and invoices
  carry over unchanged.
- 2026-11-27: the WooCommerce shop (the Legacy Starter Deck) is carried over
  for now.
- The two remaining plugins arrived (aerial-timelapse, gff-drive-backup) and
  are being ported.
- Garden links already sent stop working after the move (they were signed
  with WordPress's salt); one customer has one. Resend from the client admin.

## Open questions for Martin

- After an express sign-up the plugin does **not** sign the person in. The
  Worker keeps that: signing in whoever typed an email would let anyone open
  an account page for an address they don't own. They sign in with the
  emailed code instead.
- The account page's `[woocommerce_my_account]`: with sign-in moved, its
  only remaining use is "Manage password & account details" — drop it?

## Next session

Start with `docs/HANDOFF-2026-11-27.md` (this repo): every site, how deploys work, and the cutover checklist. Before the first invoice run on Cloudflare, check the invoice log against what WordPress may have sent after the 2026-11-26 export, so nobody is invoiced twice.
