# Aerial Timelapse (WordPress plugin)

Per-customer **overhead aerial timelapse** for the GFF **MyFarm** and BGH
**MyEstate** account pages. Type an address once (prefilled from the
WooCommerce billing address when available) → the plugin geocodes it and
indexes every historical **USDA NAIP** aerial photo of that spot
(public domain, ~0.3–1 m resolution, back to ~2010), playing them as a
scrubbable multi-year timelapse. A weekly login-triggered check watches for
new NAIP flights; new imagery arms a **30-day yellow glow** on the card.

Built app-store-ready: mobile-first touch UI (≥44 px targets, no hover
dependencies) and a REST-backed frontend, so it carries into the future
Capacitor-wrapped iOS/Android versions of the sites with no rewrite.

## Install

1. Copy this folder to `wp-content/plugins/aerial-timelapse/` (or upload
   `aerial-timelapse.zip` via Plugins → Add New → Upload) on both sites.
2. Activate. No API keys or external accounts.
3. Put `[aerial_timelapse]` on the MyFarm / MyEstate account page (inside the
   logged-in customer's view). That's it — no cron setup required.

## Update checks (login-triggered, weekly, staggered)

When a customer logs in, their property is checked for new imagery — **at
most once per week per customer**, and each customer's weekly cycle is
staggered 0–6 days by signup date so cohorts never hit the catalog together.
The check is a single catalog query (no image transfer), so it adds ~no login
overhead. Neither WP-Cron nor a host cron is needed.

When a new NAIP flight covers a saved property, the frame is appended and
`is_new_update` + a 30-day `new_update_expiry` are set — the card pulses
yellow with a "NEW IMAGERY" badge until expiry (auto-cleared). NAIP re-flies
each county every 1–3 years, so updates are rare by design.

Optional bulk sweep (e.g. for customers who rarely log in) — token, commands,
last-run status, and a "Run check now" button live under **Settings → Aerial
Timelapse**:

- **REST** (works from a host cron):
  `curl -s "https://SITE/wp-json/aerial-timelapse/v1/check-updates?token=TOKEN"`
- **WP-CLI**: `wp aerial-timelapse check` (token: `wp aerial-timelapse token`)

## REST API

The web frontend consumes these same endpoints a future native shell can call
(cookie auth + nonce in-browser; [application passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)
from a wrapped app):

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /wp-json/aerial-timelapse/v1/property` | logged-in user | Own timelapse: `{ has_property, address, frames: [{url, date}], is_new_update, new_update_expiry, last_updated_at }` |
| `GET …/property?user_id=N` | staff (`edit_users`) | A customer's timelapse |
| `POST …/property` `{address}` | logged-in user | Geocode + build own timelapse |
| `GET|POST …/check-updates` | token or admin | Run the daily delta check |

## How customers use it

- A logged-in customer with no saved property sees a one-field address form.
  Submitting it builds their timelapse (~5–20 s to download frames).
- Staff can set/rebuild/clear any customer's address from **Users → Edit
  User → Aerial Timelapse**.
- Shortcode options: `[aerial_timelapse user_id="123"]` (staff preview),
  `[aerial_timelapse editable="no"]` (hide the self-serve form).

## Architecture notes

- **Imagery**: NAIP via Microsoft Planetary Computer (free, anonymous, public
  domain). Frames are cropped to a ~90 m square centered on the geocoded
  point at 512×512 px, rendered on demand by the provider.
- **Storage — none on your server**: customer devices load frame images
  directly from the provider; the DB (user meta) holds only metadata — frame
  URL, date, scene id, `is_new_update`, expiry — a few hundred bytes per
  customer, so storage never scales with customer count. If you ever want
  local copies instead (public domain allows it), flip
  `add_filter( 'at_store_frames', '__return_true' )` and rebuild the
  timelapse — frames then download to
  `wp-content/uploads/aerial-timelapse/<user_id>/` (never DB blobs).
- **Pipeline seam**: geocode → NAIP fetch → crop → store lives in
  `AT_Fetcher` + the `AT_Imagery_Source` interface
  (`includes/class-at-imagery-source.php`), fully separate from the UI/REST
  layer — liftable into a standalone worker later without touching the
  frontend. To swap in Nearmap:
  `add_filter( 'at_imagery_source', fn() => new My_Nearmap_Source() );`
- **Geocoding**: free US Census geocoder (US addresses; no key).
- Tuning filters: `at_bbox_meters` (default 90), `at_frame_px` (default 512).

## Demo without WordPress

Open `demo/demo.html` in a browser — same player JS/CSS, frames streamed
straight from the NAIP API for a sample address.
