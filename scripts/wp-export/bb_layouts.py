#!/usr/bin/env python3
"""Rebuild the Beaver Builder pages' layouts (rows, columns, modules and their
styles) from the WordPress database, as HTML the Astro site drops in.

    php scripts/wp-export/bb-dump.php db30ppfkssttcs byz_ > /tmp/bb.json
    python3 -I scripts/wp-export/bb_layouts.py /tmp/bb.json db30ppfkssttcs byz_ \
        apps/martingawlakcompany/src/data/layouts.json

Text goes through the same cleaning as the rest of the export (shortcodes to
the site's own components, site URLs made relative).
"""
import html as H
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).parent))
from export import SITE_URL_RE, SHORTCODE_RE, BLOCK_COMMENT_RE, clean, query, replace_shortcode  # noqa: E402

ROW_WIDTH = 1100  # Beaver Builder's default row width
PUBLIC: Path | None = None
MISSING: set[str] = set()
FA_ICON_RE = re.compile(r"^fa[bsrl]? fa-[\w-]+$")


def color(v) -> str:
    v = str(v or "").strip()
    if not v:
        return ""
    if v.startswith(("rgb", "#", "var(")):
        return v
    return "#" + v if re.fullmatch(r"[0-9a-fA-F]{3,8}", v) else ""


def num(v) -> str:
    v = str(v if v is not None else "").strip()
    return v if re.fullmatch(r"-?\d+(\.\d+)?", v) else ""


def css(**props) -> str:
    parts = [f"{k.replace('_', '-')}:{v}" for k, v in props.items() if v not in ("", None)]
    return ' style="' + H.escape(";".join(parts), quote=True) + '"' if parts else ""


def box(s: dict, kind: str, default: str) -> dict:
    """margin_* / padding_* with Beaver Builder's defaults when unset."""
    out = {}
    for side in ("top", "right", "bottom", "left"):
        v = num(s.get(f"{kind}_{side}"))
        unit = s.get(f"{kind}_unit") or "px"
        out[f"{kind}_{side}"] = f"{v}{unit}" if v else default
    return out


def typography(s: dict, key: str = "typography") -> dict:
    t = s.get(key) or {}
    if not isinstance(t, dict):
        return {}
    out = {}
    fs = t.get("font_size") or {}
    if isinstance(fs, dict) and num(fs.get("length")):
        out["font_size"] = f"{fs['length']}{fs.get('unit') or 'px'}"
    lh = t.get("line_height") or {}
    if isinstance(lh, dict) and num(lh.get("length")):
        out["line_height"] = f"{lh['length']}{lh.get('unit') or ''}"
    if t.get("text_align"):
        out["text_align"] = t["text_align"]
    if t.get("font_weight") not in (None, "", "default"):
        out["font_weight"] = t["font_weight"]
    return out


def radius(s: dict) -> str:
    b = s.get("border") or {}
    r = b.get("radius") if isinstance(b, dict) else None
    if not isinstance(r, dict):
        return ""
    vals = [num(r.get(k)) or "0" for k in ("top_left", "top_right", "bottom_right", "bottom_left")]
    return "" if all(v == "0" for v in vals) else " ".join(v + "px" for v in vals)


def rich(text: str) -> str:
    return clean(text or "")


def raw(text: str) -> str:
    """Custom HTML: shortcodes and site URLs handled, but no paragraph wrapping."""
    t = BLOCK_COMMENT_RE.sub("", text or "")
    t = SHORTCODE_RE.sub(replace_shortcode, t)
    return SITE_URL_RE.sub("", t)


def youtube_embed(url: str) -> str:
    m = re.search(r"(?:youtu\.be/|v=|embed/)([\w-]{6,})", url or "")
    return f"https://www.youtube.com/embed/{m.group(1)}" if m else ""


def icon(cls: str, size: str = "") -> str:
    cls = str(cls or "").strip()
    return f'<i class="{H.escape(cls)}" aria-hidden="true"{css(font_size=size)}></i>' if FA_ICON_RE.match(cls) else ""


class Layout:
    def __init__(self, nodes: list[dict], media: dict):
        self.media = media
        self.kids: dict[str, list[dict]] = {}
        for n in nodes:
            self.kids.setdefault(n.get("parent") or "", []).append(n)
        for v in self.kids.values():
            v.sort(key=lambda n: n.get("position", 0))
        self.uses_icons = False

    def children(self, node) -> list[dict]:
        return self.kids.get(node["node"], [])

    def url(self, v) -> str:
        v = str(v or "")
        u = self.media.get(v, "") if v.isdigit() else SITE_URL_RE.sub("", v)
        # A file the new site does not have (left behind in the move) reads as no file.
        if PUBLIC and u.startswith("/wp-content/") and not (PUBLIC / unquote(u).lstrip("/")).exists():
            MISSING.add(unquote(u))
            return ""
        return u

    def render(self) -> str:
        return "".join(self.row(n) for n in self.kids.get("", []) if n["type"] == "row")

    # Rows: full-width or boxed, with a color, photo or video background.
    def row(self, n) -> str:
        s = n["settings"]
        bg = {}
        overlay = color(s.get("bg_overlay_color"))
        layers = [f"linear-gradient({overlay},{overlay})"] if overlay else []
        video = ""
        kind = s.get("bg_type")
        if kind == "color":
            bg["background_color"] = color(s.get("bg_color"))
        elif kind == "photo":
            src = self.url(s.get("bg_image_src")) or self.url(s.get("bg_image"))
            if src:
                layers.append(f"url('{src}')")
            bg.update(background_size=s.get("bg_size") or "cover", background_position=s.get("bg_position") or "center center",
                      background_repeat="no-repeat" if s.get("bg_repeat") in ("none", "no-repeat") else "repeat",
                      background_attachment=s.get("bg_attachment") or "scroll")
        elif kind == "video":
            poster = self.url(s.get("bg_video_fallback_src")) or self.url(s.get("bg_video_fallback"))
            src = self.url(s.get("bg_video"))
            if src and s.get("bg_video_source", "wordpress") == "wordpress":
                video = (f'<video class="fl-bg-video" autoplay muted loop playsinline preload="metadata"'
                         f'{" poster=" + chr(34) + H.escape(poster) + chr(34) if poster else ""} src="{H.escape(src)}"></video>')
            elif poster:
                layers.append(f"url('{poster}')")
                bg.update(background_size="cover", background_position="center center")
            if overlay:
                video += f'<div class="fl-bg-overlay"{css(background=overlay)}></div>'
                layers = [l for l in layers if not l.startswith("linear-gradient")]
        if layers:
            bg["background_image"] = ",".join(layers)
        if s.get("full_height") == "custom" and num(s.get("min_height")):
            bg["min_height"] = f"{s['min_height']}{s.get('min_height_unit') or 'px'}"
        pad = box(s, "padding", "20px")
        mar = box(s, "margin", "0")
        full = s.get("width") == "full"
        inner_w = "" if s.get("content_width") == "full" else f"{ROW_WIDTH}px"
        style = css(**bg, **mar, color=color(s.get("text_color")))
        groups = "".join(self.group(g) for g in self.children(n) if g["type"] == "column-group")
        content = f'<div class="fl-row-content"{css(max_width=inner_w, **pad)}>{groups}</div>'
        cls = "fl-row " + ("fl-row-full" if full else "fl-row-fixed") + (" fl-row-video" if video else "")
        return f'<div class="{cls}"{style}>{video}{content}</div>'

    def group(self, n) -> str:
        return '<div class="fl-col-group">' + "".join(self.col(c) for c in self.children(n) if c["type"] == "column") + "</div>"

    def col(self, n) -> str:
        s = n["settings"]
        size = num(s.get("size")) or "100"
        style = css(width=f"{size}%", background_color=color(s.get("bg_color")) if s.get("bg_type", "color") == "color" else "",
                    min_height=f"{s['min_height']}px" if num(s.get("min_height")) else "", **box(s, "margin", "0"))
        inner = "".join(self.group(k) if k["type"] == "column-group" else self.module(k) for k in self.children(n))
        return f'<div class="fl-col"{style}>{inner}</div>'

    def module(self, n) -> str:
        s = n["settings"]
        t = s.get("type")
        fn = getattr(self, "m_" + str(t).replace("-", "_"), None)
        body = fn(s) if fn else ""
        return f'<div class="fl-module fl-module-{H.escape(str(t))}"{css(**box(s, "margin", "20px"))}>{body}</div>' if body else ""

    def m_rich_text(self, s) -> str:
        return f'<div class="fl-rich-text"{css(color=color(s.get("color")), **typography(s))}>{rich(s.get("text"))}</div>'

    def m_html(self, s) -> str:
        return f'<div class="fl-html">{raw(s.get("html"))}</div>'

    def m_heading(self, s) -> str:
        tag = s.get("tag") if s.get("tag") in ("h1", "h2", "h3", "h4", "h5", "h6") else "h2"
        text = H.escape(str(s.get("heading") or ""))
        if s.get("link"):
            text = f'<a href="{H.escape(self.url(s["link"]))}">{text}</a>'
        return f'<{tag} class="fl-heading"{css(color=color(s.get("color")), **typography(s))}>{text}</{tag}>'

    def m_photo(self, s) -> str:
        src = self.url(s.get("photo_src")) or self.url(s.get("photo")) or self.url(s.get("photo_url"))
        if not src:
            return ""
        data = s.get("data") if isinstance(s.get("data"), dict) else {}
        alt = H.escape(str(data.get("alt") or data.get("title") or ""))
        w = num(s.get("width"))
        crop = s.get("crop")
        img_style = css(width=f"{w}px" if w else "", border_radius="50%" if crop == "circle" else radius(s),
                        aspect_ratio="1" if crop in ("circle", "square") else ("3 / 4" if crop == "portrait" else ("4 / 3" if crop == "landscape" else "")),
                        object_fit="cover" if crop else "")
        img = f'<img src="{H.escape(src)}" alt="{alt}" loading="lazy"{img_style}>'
        if s.get("link_type") == "url" and s.get("link_url"):
            img = f'<a href="{H.escape(self.url(s["link_url"]))}" target="{H.escape(s.get("link_url_target") or "_self")}">{img}</a>'
        caption = f"<figcaption>{H.escape(str(s.get('caption') or ''))}</figcaption>" if str(s.get("show_caption")) not in ("", "0") and s.get("caption") else ""
        return f'<figure class="fl-photo"{css(text_align=s.get("align") or "center")}>{img}{caption}</figure>'

    def m_button(self, s) -> str:
        if s.get("icon"):
            self.uses_icons = True
        ic = icon(s.get("icon"))
        label = H.escape(str(s.get("text") or ""))
        label = f"{ic} {label}" if ic and s.get("icon_position") != "after" else (f"{label} {ic}" if ic else label)
        pad = {f"padding_{k}": f"{num(s.get('padding_' + k))}px" for k in ("top", "right", "bottom", "left") if num(s.get("padding_" + k))}
        width = {"full": "100%", "custom": f"{num(s.get('custom_width'))}px" if num(s.get("custom_width")) else ""}.get(s.get("width"), "")
        style = css(background_color=color(s.get("bg_color")), color=color(s.get("text_color")), width=width, border_radius=radius(s),
                    __h_bg=color(s.get("bg_hover_color")), __h_color=color(s.get("text_hover_color")), **pad, **typography(s))
        align = s.get("align") or "left"
        if s.get("click_action") == "lightbox":
            return (f'<details class="fl-button-wrap fl-lightbox"{css(text_align=align)}><summary class="fl-button"{style}>{label}</summary>'
                    f'<div class="fl-lightbox-content">{rich(s.get("lightbox_content_html"))}</div></details>')
        href = H.escape(self.url(s.get("link")))
        target = H.escape(s.get("link_target") or "_self")
        return f'<div class="fl-button-wrap"{css(text_align=align)}><a class="fl-button" href="{href}" target="{target}"{style}>{label}</a></div>'

    def m_video(self, s) -> str:
        if s.get("video_type") == "media_library":
            data = s.get("data") if isinstance(s.get("data"), dict) else {}
            src = self.url(s.get("video")) or SITE_URL_RE.sub("", str(data.get("url") or ""))
            if not src:
                return ""
            flags = (" autoplay muted" if str(s.get("autoplay")) == "1" else "") + (" loop" if str(s.get("loop")) == "1" else "")
            return f'<video class="fl-video" controls playsinline preload="metadata"{flags} src="{H.escape(src)}"></video>'
        code = str(s.get("embed_code") or "").strip()
        yt = youtube_embed(code) if not code.startswith("<") else ""
        if yt:
            return f'<div class="fl-video-embed"><iframe src="{yt}" title="Video" loading="lazy" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>'
        return f'<div class="fl-video-embed">{raw(code)}</div>' if code else ""

    def m_icon(self, s) -> str:
        self.uses_icons = True
        size = f"{num(s.get('size'))}px" if num(s.get("size")) else ""
        ic = icon(s.get("icon"), size)
        if not ic:
            return ""
        label = H.escape(str(s.get("sr_text") or ""))
        if s.get("link"):
            ic = f'<a href="{H.escape(self.url(s["link"]))}" target="{H.escape(s.get("link_target") or "_self")}" aria-label="{label}">{ic}</a>'
        return f'<div class="fl-icon-wrap"{css(text_align=s.get("align") or "left")}>{ic}</div>'


def main() -> None:
    global PUBLIC
    src, db, prefix, out = sys.argv[1:5]
    PUBLIC = Path(sys.argv[5]) if len(sys.argv) > 5 else None
    dump = json.loads(Path(src).read_text())
    slugs = {str(r["id"]): r["slug"] for r in query(db, f"select json_object('id', ID, 'slug', post_name) from {prefix}posts where post_status='publish' and post_type in ('page','post')")}
    layouts = {}
    for pid, page in dump["pages"].items():
        slug = slugs.get(pid)
        if not slug:
            continue
        lay = Layout(page["nodes"], dump["media"])
        html = lay.render()
        if html:
            layouts[slug] = {"html": html, "hideTitle": page["hideTitle"], "icons": lay.uses_icons}
    Path(out).write_text(json.dumps(layouts, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(layouts)} layouts written to {out}", file=sys.stderr)
    if MISSING:
        print("media not on the new site (left out):", *sorted(MISSING), sep="\n  ", file=sys.stderr)


if __name__ == "__main__":
    main()
