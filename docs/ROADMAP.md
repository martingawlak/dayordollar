# What's left

## Needed from Martin

- **MGC Zora Launchpad plugin** (`wp-content/plugins/mgc-zora-launchpad`). Its homepage
  coin widget, gifting and app features need its code to be rebuilt. For now the site
  links to zora.co/@martingawlak.
- **Gawlak Family Farms plugin** (the `gff_*` shortcodes). The live page is generated
  by this plugin: the "Your Own Farm That Comes With a Farmer" pitch, Zora Sunrise and
  Spire Tower plans, the full service agreement, enrollment form and payments
  (PayPal, Cash App, Venmo, Zelle, ACH, Chime). The database only holds an older
  version of the page, so `/gawlak-family-farms/` must not launch until it's rebuilt
  from the plugin code.
- **`/rainbowgun` ($GAWLAK Family Bank)**: ported. The page and paper are copied from
  `imports/siteground/`, `race.php` is now the `/rainbowgun/race` function, and the
  invite and card windows keep using the existing `gawlak-invite` Cloudflare worker.
- **Security:** move any funds out of the wallet whose private key the Zora plugin
  stored in WordPress (`mgcz_gift_key`) and rotate the Zora API key. Both were stored
  in plain text in the database.

## Brand sites

Several brands are separate sites that also live on SiteGround today, so
SiteGround can't be cancelled until they move too. Their code is in private repos
(each keeps its own codebase and rules; see each repo's CLAUDE.md):

- **babyzoragawlak.com** (`martingawlak/babyzoragawlak`): Astro game, already static,
  plus its own Cloudflare Worker (`zora-ticket-booth`). Builds clean (138 files, none
  over 20 MB), so moving it is a Cloudflare Pages deploy plus a DNS change, no code
  changes. Note: its `package-lock.json` is out of sync (`npm ci` fails; `npm install`
  works).
- **bandturo.com** (`martingawlak/bandturo-appearances`): an ~11k-line WordPress plugin
  plus two USDC escrow contracts live on Base mainnet. Payments, wallet proofs and
  refunds depend on WordPress users and AJAX. Porting it is a large, real-money
  project; until decided, it stays on WordPress.
- **dayordollar.com** (`martingawlak/dod-zora`; plugin on `ux-consolidated-window`):
  WordPress plugin plus the immutable Patronage Vault on Base. Same situation as
  Bandturo.
- **deaddreamsbooking.com**: not checked yet.

All brands share `packages/brands`, the accounts service and the `@mgc/sso` sign-in.
A new brand site is a copy of the main site's layout with its own pages.

- **Dead Dreams Booking**: an events page built from the Dead Dreams Booking Facebook
  page's events. Facebook's API can read events from a Page you manage (using a Page
  access token), but not from a personal profile, so events should be created on (or
  co-hosted with) the Page. Plan: a scheduled Worker pulls Page events into a small
  database every hour and the site lists them.
- **Bandturo**: ticketing. Import Facebook events (same feed as Dead Dreams), sell
  tickets with Stripe Checkout, and tie tickets to the shared account so buyers see
  them on every brand.
- **Fort Pierce Purple Martins** (fppm.us): linked from the live Iced Marty menu; not
  looked at yet.

## RainbowGun launchpad ($GAWLAK)

Design is in [rainbowgun-launchpad.md](rainbowgun-launchpad.md). Needs the existing
`/rainbowgun` files and the GAWLAK contracts/keeper code before building.

## Coach Martin (boxing gym)

A gym-management plugin (v0.7.0) built for WordPress but never installed on the live
site, so there's no member data to migrate. Its code is only on Martin's computer
(`coach-martin`, local git); it needs to be pushed to a private GitHub repo first.

Port it as its own app on the shared platform rather than a plugin:

- **Login:** drop its separate members/sessions system and use the shared accounts
  service, so athletes, parents and judges get one login for every brand. Coach,
  organizer, judge and referee become roles managed from the accounts admin page.
- **Data:** its tables (gyms, athletes, bouts, documents, events, schedule, sheets,
  training) move to a D1 database almost as-is.
- **Features to carry over:** roster and affiliated gyms, the FABC Appendix A bout
  matcher, printable pre-bout chart, weekly schedule and events, FABC events feed
  (cached every 6 hours), event emails (via Cloudflare Email Sending instead of `wp_mail`), the public
  matchup checker with saved bout sheets (3 per member), and the Proven Training
  library with public / members / staff tiers.
- Brand colors: blue, gold and white.

## Nice to have

- Product images, inventory counts and a cart if the shop grows.
- Stripe Tax for automatic sales tax.
- A members area showing purchases across brands.

## Retired for now

- **Iced Marty** (2026-11-25): off the site, its two products off sale. The pay page
  is kept in `apps/martingawlakcompany/retired/` for reuse; see the README there.
