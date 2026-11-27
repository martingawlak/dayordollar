# Launch log

## 2026-11-25 — babyzoragawlak.com moved to Cloudflare Pages

- Pages project `babyzoragawlak` (builds from `martingawlak/babyzoragawlak`, `master`).
- DNS: the apex and `www` A records (SiteGround) were replaced with proxied CNAMEs
  to `babyzoragawlak.pages.dev`. Mail records (MX, SPF, DMARC, `mail`, `autoconfig`,
  `autodiscover`, `ftp`, `ssh`) were not touched; BabyZora email still runs on SiteGround.
- Checked after the switch: both hostnames serve build `20261125204412`, the same as
  `babyzoragawlak.pages.dev`.

**Rollback** (back to SiteGround): delete the two CNAMEs and recreate these A records
(DNS only, not proxied):

- `babyzoragawlak.com`: 34.120.190.48, 35.244.153.44, 34.160.81.203, 34.149.36.179
- `www.babyzoragawlak.com`: 34.120.190.48, 34.160.81.203, 34.149.36.179, 35.244.153.44


## 2026-11-25 — all domains on Cloudflare DNS; martingawlakcompany.com live on Pages

- Nameservers changed at GoDaddy to `nero.ns.cloudflare.com` / `raegan.ns.cloudflare.com`
  for martingawlakcompany.com, bandturo.com, dayordollar.com, fppm.us and
  gawlakfamilyfarms.com. Every record was copied DNS-only from the live SiteGround
  zone first and checked against SiteGround's nameservers (website and mail records
  identical), so the other sites and all email kept working unchanged.
- martingawlakcompany.com and www: SiteGround A records (34.174.251.210) replaced with
  proxied CNAMEs to `martingawlakcompany.pages.dev`. Mail records untouched.
- Login service at `accounts.martingawlakcompany.com` (Worker custom domain).
- `/gawlak-family-farms/` redirects to gawlakfamilyfarms.com; `/icedmarty` to home.

**Rollback** for martingawlakcompany.com: delete the two CNAMEs and recreate
`martingawlakcompany.com` and `www.martingawlakcompany.com` as A 34.174.251.210
(DNS only).

**Not set up yet on the new site:** Stripe key (deck checkout answers "unavailable"),
sign-in emails and contact-form mail (need Email Sending enabled for the domain), and
the site's sign-in credentials (`SSO_CLIENT_ID` / `SSO_CLIENT_SECRET`).

## bandturo.com — switched 2026-11-27 (~03:58 UTC)

- Production Worker `bandturo` deployed by Martin from his PC (version
  `bacfd6ed`), crons on (`7 * * * *`, `0 9 * * *`). Secrets: SESSION_SECRET,
  SSO_CLIENT_SECRET, RESEND_API_KEY, PRINTFUL_TOKEN, PAYPAL_CLIENT_ID,
  PAYPAL_SECRET. R2 `bandturo-uploads` bound.
- DNS: the apex and `www` A records (34.174.12.109, DNS-only, TTL auto) were
  deleted and replaced by Worker custom domains `bandturo.com` and
  `www.bandturo.com` → `bandturo` (production). The Worker redirects www to the
  bare domain. Mail, ftp, autoconfig/autodiscover, ssh and DKIM records untouched.
- Checked: `/api/health` (19 users), `/`, `/about/`, `/faq/`, an upload from R2,
  www → apex with path and query, sign-in hands over to the accounts service
  with `redirect_uri=https://bandturo.com/auth/callback`; no script errors at
  desktop or phone width; the public page's text matched the old site's
  beforehand.
- **Rollback:** delete the two custom domains (Workers → bandturo → Domains),
  recreate A `bandturo.com` and A `www` → 34.174.12.109, DNS-only.
- The old WordPress was left running but idle: SiteGround has no cron jobs for
  bandturo.com (Martin checked Site Tools → Devs → Cron Jobs: empty), so its
  WP-Cron only fires on visits, which now reach the Worker. The plugin was not
  deactivated.

## dayordollar.com — switched 2026-11-27 (~04:40 UTC)

- Production Worker `dayordollar` deployed by Martin (version `54e84580`), cron
  `*/15 * * * *` (set through the API after the free plan's 5-trigger limit
  refused it; Bandturo's two triggers were merged into one to make room).
  Secrets: SESSION_SECRET, SSO_CLIENT_SECRET, RESEND_API_KEY, ZORA_API_KEY,
  GIFT_KEY, BUYBACK_KEY (fresh wallets), PRINTFUL_TOKEN, PAYPAL_SECRET,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Not set: GDRIVE_CLIENT_SECRET (no
  one has Drive connected), MERCH_KEY (no merch wallet on the live site).
- DNS: the apex and `www` A records (34.174.12.109, DNS-only, TTL auto) were
  replaced by Worker custom domains `dayordollar.com` and `www.dayordollar.com`.
  The Worker redirects www to the bare domain. Mail records untouched.
- Checked: `/`, `/privacy/`, `/account/`, `/shop/`, the background video from
  R2, www → apex, sign-in hands over to the accounts service with
  `redirect_uri=https://dayordollar.com/auth/callback`, the Stripe webhook
  answers an unsigned post with "bad signature" (400). The public page's text
  matched the old site's beforehand (only TranslatePress's switcher is gone).
- SiteGround has no cron jobs for dayordollar.com (Martin checked), so the old
  WordPress is idle. Its database still holds the OLD wallet keys; those
  wallets were emptied first (gift: 500,000 $dayordollar moved; buyback: ETH
  moved).
- **Rollback:** delete the two custom domains, recreate A `dayordollar.com` and
  A `www` → 34.174.12.109, DNS-only.

