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
| `gff_dbk_sa_json` (Drive backup plugin's service-account key) | left out until that plugin is ported |
| user passwords, session tokens, Site Kit tokens | not carried over (sign-in moves to the accounts service) |

Plus the Worker's own: `SSO_CLIENT_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`.

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
| Client admin: GFF Clients, GFF Settings, profile panels, admin-post handlers, CSV export | not yet |
| Invoices and the daily `gff_v33_cron` | not yet |
| Dispatch and routes (geocoding, OSRM) | not yet |
| Consent flow (`gff_v34_consent`, `[gff_start]`, the token claim helper) | ported, checked |
| Page shell (Astra + Beaver Builder layouts for the three pages), routes, Worker entry | not yet |
| `aerial-timelapse`, `gff-drive-backup` | waiting for the plugins |

## Open questions for Martin

- After an express sign-up the plugin does **not** sign the person in. The
  Worker keeps that: signing in whoever typed an email would let anyone open
  an account page for an address they don't own. They sign in with the
  emailed code instead.
- The account page's `[woocommerce_my_account]`: with sign-in moved, its
  only remaining use is "Manage password & account details" — drop it?
- The two pending plugins.
- The live `wp_salt( 'auth' )` (AUTH_KEY and AUTH_SALT from wp-config.php) if
  garden links already sent should keep working.
