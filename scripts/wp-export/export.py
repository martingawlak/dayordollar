#!/usr/bin/env python3
"""Export WordPress content (pages, posts, products) to JSON for the Astro site.

Reads from a MySQL/MariaDB database loaded with the SiteGround phpMyAdmin dump:

    mysql < localhost.sql
    python3 -I scripts/wp-export/export.py --db db30ppfkssttcs --prefix byz_ \
        --out apps/martingawlakcompany/src/data

Only published, public content is exported. Customer data (users, orders, form
entries) is never written to the repo.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

SITE_URL_RE = re.compile(r"https?://(?:(?:www\.)?martingawlakcompany\.com|marting18\.sg-host\.com)(?=/|\")", re.I)
BLOCK_COMMENT_RE = re.compile(r"<!--\s*/?wp:[^>]*?-->", re.S)
SHORTCODE_RE = re.compile(r"\[(/?)([a-zA-Z_][\w-]*)([^\]]*)\]")
BLOCK_TAGS = (
    "address|article|aside|blockquote|details|div|dl|fieldset|figcaption|figure|footer|form|"
    "h[1-6]|header|hr|iframe|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul|"
    "img|a|script|style"
)
BLOCK_START_RE = re.compile(rf"^\s*</?(?:{BLOCK_TAGS})\b", re.I)

# Shortcodes we turn into components. Other plugin shortcodes are dropped and
# reported; bracketed prose like "[your name]" is left alone.
KNOWN_EMBEDS = {
    "mgc_zora": '<div data-embed="zora"></div>',
    "wpforms": '<div data-embed="contact-form"></div>',
}
PLUGIN_SHORTCODES = {"trustindex", "bwg", "expander_maker", "embed", "caption", "gallery"}
SHORTCODE_ATTR_RE = re.compile(r'(\w+)="([^"]*)"')

dropped_shortcodes: Counter = Counter()


def query(db: str, sql: str) -> list[dict]:
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "-N", "--batch", "--raw", db, "-e", sql],
        check=True, capture_output=True, text=True,
    ).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def replace_shortcode(m: re.Match) -> str:
    closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3)
    if closing:
        return "" if name in KNOWN_EMBEDS or name in PLUGIN_SHORTCODES or "_" in name or name == "video" else m.group(0)
    if name in KNOWN_EMBEDS:
        return KNOWN_EMBEDS[name]
    if name == "video":
        src = next((v for k, v in SHORTCODE_ATTR_RE.findall(attrs) if k in {"mp4", "src", "mov", "webm"}), "")
        return f'<video controls preload="metadata" src="{src}"></video>' if src else ""
    if name in PLUGIN_SHORTCODES or "_" in name:
        dropped_shortcodes[name] += 1
        return ""
    return m.group(0)


def autop(html: str) -> str:
    """A small take on WordPress' wpautop for classic-editor content."""
    chunks = re.split(r"\n\s*\n", html.replace("\r\n", "\n"))
    out = []
    for chunk in chunks:
        text = chunk.strip()
        if not text:
            continue
        if BLOCK_START_RE.match(text):
            out.append(text)
        else:
            out.append("<p>" + re.sub(r"\s*\n\s*", "<br>\n", text) + "</p>")
    return "\n".join(out)


def clean(html: str) -> str:
    html = BLOCK_COMMENT_RE.sub("", html or "")
    html = SHORTCODE_RE.sub(replace_shortcode, html)
    html = SITE_URL_RE.sub("", html)
    html = re.sub(r'\s(?:onerror|itemprop)="[^"]*"', "", html)
    html = re.sub(r"<p>\s*(?:&nbsp;)?\s*</p>", "", html)
    html = re.sub(r"[ \t]+\n", "\n", html)
    return autop(html).strip()


def meta_sql(prefix: str, key: str) -> str:
    return f"(select meta_value from {prefix}postmeta m where m.post_id=p.ID and m.meta_key='{key}' limit 1)"


def attachment_sql(prefix: str) -> str:
    return (
        f"(select a.meta_value from {prefix}postmeta a where a.meta_key='_wp_attached_file' "
        f"and a.post_id={meta_sql(prefix, '_thumbnail_id')} limit 1)"
    )


def export_posts(db: str, prefix: str, post_type: str) -> list[dict]:
    rows = query(db, f"""
        select json_object(
          'id', p.ID, 'slug', p.post_name, 'title', p.post_title, 'date', p.post_date_gmt,
          'modified', p.post_modified_gmt, 'content', p.post_content, 'excerpt', p.post_excerpt,
          'description', {meta_sql(prefix, '_yoast_wpseo_metadesc')},
          'seoTitle', {meta_sql(prefix, '_yoast_wpseo_title')},
          'image', {attachment_sql(prefix)},
          'categories', (select json_arrayagg(t.name) from {prefix}term_relationships r
             join {prefix}term_taxonomy tt on tt.term_taxonomy_id=r.term_taxonomy_id and tt.taxonomy='category'
             join {prefix}terms t on t.term_id=tt.term_id where r.object_id=p.ID)
        ) from {prefix}posts p where p.post_type='{post_type}' and p.post_status='publish'
        order by p.post_date_gmt desc""")
    items = []
    for r in rows:
        r["content"] = clean(r["content"])
        r["excerpt"] = (r.get("excerpt") or "").strip()
        r["image"] = f"/wp-content/uploads/{r['image']}" if r.get("image") else None
        r["categories"] = [c for c in (r.get("categories") or []) if c != "Uncategorized"]
        items.append(r)
    return items


def export_products(db: str, prefix: str) -> list[dict]:
    rows = query(db, f"""
        select json_object(
          'id', p.ID, 'slug', p.post_name, 'title', p.post_title, 'content', p.post_content,
          'summary', p.post_excerpt, 'price', {meta_sql(prefix, '_price')}, 'sku', {meta_sql(prefix, '_sku')},
          'virtual', {meta_sql(prefix, '_virtual')}, 'taxStatus', {meta_sql(prefix, '_tax_status')},
          'image', {attachment_sql(prefix)}, 'description', {meta_sql(prefix, '_yoast_wpseo_metadesc')}
        ) from {prefix}posts p where p.post_type='product' and p.post_status='publish' order by p.ID""")
    products = []
    for r in rows:
        products.append({
            "slug": r["slug"],
            "name": r["title"],
            "sku": r.get("sku") or f"WP-{r['id']}",
            "priceCents": round(float(r["price"]) * 100),
            "currency": "usd",
            "shipping": r.get("virtual") != "yes",
            "taxable": r.get("taxStatus") == "taxable",
            "image": f"/wp-content/uploads/{r['image']}" if r.get("image") else None,
            "summary": (r.get("summary") or "").strip(),
            "description": r.get("description"),
            "content": clean(r["content"]),
            "active": True,
        })
    return products


def export_menu(db: str, prefix: str, menu: str) -> list[dict]:
    rows = query(db, f"""
        select json_object('id', p.ID, 'order', p.menu_order, 'title', p.post_title,
          'parent', {meta_sql(prefix, '_menu_item_menu_item_parent')},
          'object', {meta_sql(prefix, '_menu_item_object')},
          'objectId', {meta_sql(prefix, '_menu_item_object_id')},
          'url', {meta_sql(prefix, '_menu_item_url')},
          'targetTitle', (select o.post_title from {prefix}posts o where o.ID={meta_sql(prefix, '_menu_item_object_id')}),
          'targetSlug', (select o.post_name from {prefix}posts o where o.ID={meta_sql(prefix, '_menu_item_object_id')})
        ) from {prefix}posts p
        join {prefix}term_relationships r on r.object_id=p.ID
        join {prefix}term_taxonomy tt on tt.term_taxonomy_id=r.term_taxonomy_id
        join {prefix}terms t on t.term_id=tt.term_id
        where p.post_type='nav_menu_item' and t.name='{menu}' order by p.menu_order""")
    by_id = {}
    for r in rows:
        href = r["url"] if r["object"] == "custom" else f"/{r['targetSlug']}/"
        by_id[str(r["id"])] = {
            "label": r["title"] or r["targetTitle"],
            "href": SITE_URL_RE.sub("", href) or "/",
            "parent": r["parent"],
            "children": [],
        }
    tree = []
    for item in by_id.values():
        parent = by_id.get(item.pop("parent") or "0")
        (parent["children"] if parent else tree).append(item)
    return tree


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--prefix", default="wp_")
    ap.add_argument("--out", required=True)
    ap.add_argument("--menu", default="Menu2")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # WooCommerce system pages and stubs that the new site replaces.
    skip = {"cart", "checkout", "my-account", "martin-3", "martin-gawlak-company"}
    pages = [p for p in export_posts(args.db, args.prefix, "page") if p["slug"] not in skip]
    posts = export_posts(args.db, args.prefix, "post")
    products = export_products(args.db, args.prefix)
    menu = export_menu(args.db, args.prefix, args.menu)

    for name, data in (("pages", pages), ("posts", posts), ("products", products), ("wp-menu", menu)):
        (out / f"{name}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {len(data):>3} {name}")
    if dropped_shortcodes:
        print("dropped shortcodes:", dict(dropped_shortcodes), file=sys.stderr)


if __name__ == "__main__":
    main()
