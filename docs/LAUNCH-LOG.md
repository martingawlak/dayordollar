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

