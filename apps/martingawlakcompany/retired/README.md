# Retired pages

Kept for reuse, never served: nothing in this folder is part of the build.

- `icedmarty/` — the Iced Marty pay page (tip chips, card via `/api/checkout?slug=…`,
  Cash App, Venmo, PayPal, Zelle, jukebox). Retired 2026-11-25 (Marti: obsolete for
  now). To bring it back: move it to `public/icedmarty/`, set the two `ICEDMARTY-*`
  products `active` in `src/data/products.json` (and remove them from
  `RETIRED_SKUS` in `scripts/wp-export/export.py`), re-add the brand in
  `packages/brands`, and drop the `/icedmarty` redirect.
