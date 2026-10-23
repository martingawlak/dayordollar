# What's left

## Needed from Martin

- **MGC Zora Launchpad plugin** (`wp-content/plugins/mgc-zora-launchpad`). Its homepage
  coin widget, gifting and app features need its code to be rebuilt. For now the site
  links to zora.co/@martingawlak.
- **Gawlak Family Farms plugin** (the `gff_*` shortcodes: farm builder, tower
  agreement, consultation and express forms). The page text is migrated; the
  interactive forms need the plugin code.
- **`/rainbowgun` ($GAWLAK Family Bank)** and the old **`/zora`** folder, which aren't
  WordPress pages; they're separate folders in `public_html`.
- **Security:** move any funds out of the wallet whose private key the Zora plugin
  stored in WordPress (`mgcz_gift_key`) and rotate the Zora API key. Both were stored
  in plain text in the database.

## Brand sites

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
- **DayorDollar**, **BabyZoraGawlak.com**: content to come.

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
  (cached every 6 hours), event emails (via Resend instead of `wp_mail`), the public
  matchup checker with saved bout sheets (3 per member), and the Proven Training
  library with public / members / staff tiers.
- Brand colors: blue, gold and white.

## Nice to have

- Product images, inventory counts and a cart if the shop grows.
- Stripe Tax for automatic sales tax.
- A members area showing purchases across brands.
