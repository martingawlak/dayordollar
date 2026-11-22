# Martin Gawlak Company platform

The websites and shared login for Martin Gawlak Company and its brands, replacing
the WordPress site that ran on SiteGround.

| Folder | What it is | Runs on |
|---|---|---|
| `apps/martingawlakcompany` | martingawlakcompany.com: pages, blog, shop, contact | Cloudflare Pages (static site + Pages Functions) |
| `apps/deaddreams` | deaddreamsbooking.com: show tickets (website + installable app), customers, inventory, door scanner | Cloudflare Pages + Pages Functions + D1 database |
| `apps/accounts` | accounts.martingawlakcompany.com: one login for every brand, admin dashboard | Cloudflare Worker + D1 database |
| `packages/brands` | The list of brands that drives the shared menu and allowed sign-in sites | — |
| `packages/sso` | "Sign in with Martin Gawlak Company" for any brand site | used by each site's `/auth/*` routes |
| `scripts/wp-export` | One-time exporter from the WordPress database | local only |

## How sign-in works

- People sign in at **accounts.martingawlakcompany.com** with an email code, Google,
  Apple or Privy (email/wallet). Every method that proves the same email address
  lands on the **same account**.
- Each brand site is an OpenID Connect client of the accounts service. A brand site
  sends visitors to `/auth/login`, they sign in (or are already signed in), and come
  straight back signed in. `/auth/logout` signs them out everywhere.
- The email in `ADMIN_EMAILS` (hello@martingawlakcompany.com) becomes an admin on
  first sign-in and can see members and issue brand-site credentials at `/admin`.

## Payments

`POST /api/checkout` creates a Stripe Checkout session for an item in
`apps/martingawlakcompany/src/data/products.json`. Prices are read from that file on
the server, never from the browser. Orders, receipts and refunds live in the Stripe
dashboard.

To add or change a product, edit `products.json` (price is in cents) and deploy.

## Dead Dreams Booking (`apps/deaddreams`)

Built from the Iced Marty pay page: same look, same tip chips ("Another day / Another dollar") and the
same pay buttons, plus ticket quantity and the buyer's name, email and phone, so every sale lands in the
customer list.

- **Direct ticket links:** each show sells at `deaddreamsbooking.com/e/<name>`. The link previews with the
  show's title, date and price on Facebook. Admin → Shows → Copy link / Share.
- **Ticket price:** new shows start at $10; change any show's price in Admin → Shows → Edit.
- **Payments:** card payments go through PayPal Checkout: a PayPal button plus a "Debit or Credit
  Card" button (no PayPal account needed). They're charged on the server and the tickets are issued
  the moment the payment goes through. (Stripe is built in too: set `cardProvider` to `"stripe"` in
  `src/config.ts`.) Cash App, Venmo, PayPal and Zelle open the app with the amount; the buyer puts their order code
  (e.g. `DD-7K3QX`) in the note, the tickets are held for 24 hours, and staff press **Paid** in
  Admin → Orders when the money arrives. Payment handles are in `apps/deaddreams/src/config.ts`.
- **Digital tickets:** one QR code per person, emailed (via Resend) and saved on the buyer's phone so they
  open with no signal. Signed-in buyers see them on every device under My tickets.
- **Inventory:** each show has a total capacity and a count of printed tickets held by local sellers;
  online sales can never take more than what's left (unpaid orders hold their tickets until they expire).
- **Customers:** every buyer, with phone, opt-in for future shows, orders and spend. CSV download.
- **Door:** `/door/` scans QR codes with the phone camera and lets each ticket in once.
- **App:** installable to the home screen (manifest + service worker); works offline for tickets.
- **Accounts:** customers sign in with the same Martin Gawlak Company account as every other brand
  (menu → Sign in, or the link on the ticket form). Signed in, their details fill in, their orders are
  linked to the account, and My tickets shows them on any device.
- **Staff access:** sign in with the shared Martin Gawlak Company account. Emails in `ADMIN_EMAILS`
  get the admin; emails in `DOOR_EMAILS` get only the scanner (`apps/deaddreams/wrangler.toml`).

```bash
cd apps/deaddreams
cp .dev.vars.example .dev.vars            # DEV_STAFF_EMAIL skips sign-in on localhost
npm run db:migrate:local
npm run build && npx wrangler pages dev dist --port 8788 --ip 127.0.0.1
```

To launch: `wrangler d1 create deaddreams` and put its id in `wrangler.toml`, `npm run db:migrate`,
create a Pages project `deaddreams` with the secrets listed in `wrangler.toml` (PayPal: create a REST
app under developer.paypal.com → Apps & Credentials → Live, on the PayPal Business account that
should receive the money, and copy its client id and secret), and register the site's origin as a
brand client on the accounts admin. No PayPal webhook is needed.

## Local development

```bash
npm install

# Accounts service (http://localhost:8787)
cp apps/accounts/.dev.vars.example apps/accounts/.dev.vars   # fill in
npm run db:migrate:local -w @mgc/accounts
cd apps/accounts && npx vite build && npx wrangler dev --port 8787 --local-upstream localhost:8787
# Without RESEND_API_KEY, sign-in codes are printed to this terminal.

# Main site (http://127.0.0.1:8788)
cp apps/martingawlakcompany/.dev.vars.example apps/martingawlakcompany/.dev.vars
npm run build -w @mgc/site
cd apps/martingawlakcompany && npx wrangler pages dev dist --port 8788 --ip 127.0.0.1
```

For local sign-in, sign in to the accounts service as the admin, then register the
local site by calling `POST /api/admin/brand-clients` with
`{"origin":"http://127.0.0.1:8788"}` and put the returned id and secret in the
site's `.dev.vars`.

## Deploying

See [docs/LAUNCH.md](docs/LAUNCH.md) for the full step-by-step launch checklist.

## Re-exporting from WordPress

```bash
mysql < localhost.sql   # the phpMyAdmin export
python3 -I scripts/wp-export/export.py --db db30ppfkssttcs --prefix byz_ \
  --out apps/martingawlakcompany/src/data
```

Customer data (users, orders, form entries) is never exported into this repo.
