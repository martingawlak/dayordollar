# Pulled from SiteGround, 2026-11-25

Original files copied from the live sites, unchanged, so the migration can
port them. Nothing in this folder is built or served: it sits outside the
`apps/*` and `packages/*` workspaces.

| Folder | Came from | What it is |
|---|---|---|
| `gawlakfamilyfarms.com/wp-content/plugins/gff-customer-registration/` | gawlakfamilyfarms.com, plugins folder | The Gawlak Family Farms plugin: sign-up form, pricing, plans, service agreement, invoices. One PHP file. |
| `fppm.us/wp-content/plugins/fppm-team-manager/` | fppm.us, plugins folder (Martin, 2026-11-27) | The Fort Pierce Purple Martins plugin: join form (fan / player / supporter), waiver and oath, member and staff dashboards, roster, dues, events and RSVPs, PayPal + Printful store, Google Sheets waiver mirror, PWA. One PHP file plus its icons. |
| `fppm.us/wp-content/plugins/gff-drive-backup/` | fppm.us, plugins folder (Martin, 2026-11-27) | The same Drive backup plugin as the farm's (identical apart from names). |
| `martingawlakcompany.com/rainbowgun/` | martingawlakcompany.com, `public_html/rainbowgun` | The RainbowGun page, its paper, logos, and two small PHP scripts. |

## Notes for whoever ports these

- The farm plugin lives on **gawlakfamilyfarms.com**, not on
  martingawlakcompany.com. Its payment settings (PayPal, Cash App, Venmo,
  Zelle) are stored in that site's database, not in this file.
- PHP does not run on Cloudflare Pages. `rainbowgun/music.php` (lists the
  MP3s) is already replaced by `apps/martingawlakcompany/public/rainbowgun/music.json`.
  `rainbowgun/race.php` (price comparison, fetches Coinbase and Yahoo, caches
  to a file) still needs a Pages Function.
- The 13 MP3 tracks are already in `apps/martingawlakcompany/public/rainbowgun/music/`.
  The only audio left behind is the full-album MP3 (115 MB): the live
  `music.php` hides anything over 40 MB, and it is over GitHub's and Cloudflare
  Pages' file limits.
- Both folders were checked for passwords, keys and tokens before upload; none
  were found. The club password is checked by the invite worker, not stored in
  the page.
