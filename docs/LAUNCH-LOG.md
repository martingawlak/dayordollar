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
