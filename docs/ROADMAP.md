# What's left

## Needed from Martin

- **WordPress images** (`wp-content/uploads`). The site references 145 images and
  videos at their old paths; they show as broken until copied in.
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

## Nice to have

- Product images, inventory counts and a cart if the shop grows.
- Stripe Tax for automatic sales tax.
- A members area showing purchases across brands.
