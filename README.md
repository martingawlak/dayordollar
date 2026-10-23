# Martin Gawlak Company platform

The websites and shared login for Martin Gawlak Company and its brands, replacing
the WordPress site that ran on SiteGround.

| Folder | What it is | Runs on |
|---|---|---|
| `apps/martingawlakcompany` | martingawlakcompany.com: pages, blog, shop, contact | Cloudflare Pages (static site + Pages Functions) |
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
