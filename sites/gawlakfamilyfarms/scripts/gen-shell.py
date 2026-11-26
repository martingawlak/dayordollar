#!/usr/bin/env python3
"""The theme around the farm pages (Astra + Beaver Builder as
gawlakfamilyfarms.com renders them), cut from the live site's own HTML and
written to src/render/shell.gen.ts, plus the list of local files they load.

    python3 -I scripts/gen-shell.py <dir with home.html home_account.html home_garden.html> <bb.json> src/render/shell.gen.ts

Kept: Astra's styles, fonts, header, menu and footer; Beaver Builder's layout
markup, styles and scripts; Yoast's page data; the app-install manifest;
Google Tag Manager and Analytics (signed-out visitors, as Site Kit was set),
the Meta pixel (as plain base code; PixelYourSite's server-side half does not
exist without WordPress), Contentsquare, and the WPCode snippets (the Spread
button handler, iOS app meta).
Left out: WooCommerce, Jetpack stats, Photo Gallery and Expand Maker (nothing
on these pages uses them), Site Kit's Google sign-in button, feed/oEmbed/REST
links, and everything the GFF plugin prints (the Worker prints that itself).
The modules that hold the plugin's shortcodes become __MODULE_<node>__ holes,
filled by the Worker from the layout's own text (MODULE_TEXT).
"""
import json
import re
import sys

src_dir, bb_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
PAGES = {"home": ("home.html", "3568"), "account": ("home_account.html", "4049"), "garden": ("home_garden.html", "4086")}
bb = json.load(open(bb_path))["pages"]

DROP_HEAD = [
    r"<script>\s*var bwg_admin_ajax.*?</script>",
    r"<script>\s*window\._wca = .*?</script>",
    r"<link rel='dns-prefetch'[^>]*>",
    r'<link rel="alternate"[^>]*>',
    r'<link rel="https://api.w.org/"[^>]*>', r'<link rel="EditURI"[^>]*>', r"<link rel='shortlink'[^>]*>",
    r"<script type='application/javascript'\s+id='pys-version-script'>.*?</script>",
    r'<script id="pys-pbid-prefetch">.*?</script>',
    r'<script id="jquery-core-js-extra">.*?</script>',
    r'<script defer id="twbbwg-[^"]*"[^>]*>.*?</script>', r'<script id="twbbwg-[^"]*">.*?</script>',
    r'<script defer id="(sumoselect|bwg_mobile|mCustomScrollbar|jquery-fullscreen|bwg_frontend)-js"[^>]*>.*?</script>',
    r'<script id="bwg_frontend-js-extra">.*?</script>',
    r'<script[^>]*id="(wc-[^"]*|woocommerce[^"]*|WCPAY_ASSETS[^"]*)"[^>]*>.*?</script>',
    r"<link rel='stylesheet' id='woocommerce-smallscreen-css'[^>]*>",
    r'<style id="woocommerce-(layout|general|inline)-inline-css">.*?</style>',
    r'<style id="jetpack-stats-inline-css">.*?</style>',
    r'<style id="gff-reg-inline-css">.*?</style>',
    r'<script>\s*readMoreArgs = \[\]\s*</script>',
    r'<script type="text/javascript">\s*EXPM_VERSION=.*?</script>',
    r'<link rel="preload" href="[^"]*beaver-builder-lite-version/fonts/fontawesome[^"]*"[^>]*>',
]
DROP_FOOT = [
    r'<script[^>]*id="(wc-[^"]*|woocommerce[^"]*|sourcebuster-js-js)"[^>]*>.*?</script>',
    r"<script>\s*var node = document.getElementsByClassName\('woocommerce-message'\).*?</script>",
    r'<script src="https://accounts.google.com/gsi/client"[^>]*></script>', r"<script data-siwg-config=.*?</script>",
    r'<script[^>]*id="(jquery-bind-first|js-cookie-pys|js-sha256|pys)-js(-extra)?"[^>]*>.*?</script>',
    r'<script[^>]*id="jetpack-stats-js(-before)?"[^>]*>.*?</script>',
    r'<script type="text/javascript">\s*\(function\(\) \{\s*// Always start from a fresh object.*?</script>',
    r'<script[^>]*id="gff-reg-[^"]*"[^>]*>.*?</script>',
    r'<div id="trp-floater.*?</div></div></div>',
    r"<!-- Sign in with Google button added by Site Kit -->.*?<!-- End Sign in with Google button added by Site Kit -->",
]


def strip(s, pats):
    for p in pats:
        s = re.sub(p, "", s, flags=re.S)
    return s


# How many <div>s each Beaver Builder node prints around its children.
DIVS = {"row": 3, "column-group": 1, "column": 2, "module": 1}


def closes_after(nodes, target):
    """Closing </div>s between a module's own content and the next thing the layout opens (from the layout tree)."""
    kids = {}
    for n in nodes:
        kids.setdefault(n["parent"], []).append(n)
    for v in kids.values():
        v.sort(key=lambda n: n["position"])
    events = []

    def walk(n):
        events.append(("open", n))
        for k in kids.get(n["node"], []):
            walk(k)
        events.append(("close", n))
    for r in kids.get(None, []):
        walk(r)
    i = next(j for j, (e, n) in enumerate(events) if e == "close" and n["node"] == target)
    count = 0
    while i < len(events) and events[i][0] == "close":
        count += DIVS.get(events[i][1]["type"], 0)
        i += 1
    return count


def module_inner_span(html, node, nodes):
    """The module's content: from its opening tag to the run of layout </div>s the tree says close it.
    (Counting matched <div>s is not enough: the sign-up form opens a <div> in one module and closes it in another.)"""
    m = re.compile(r'<div\s+class="fl-module [^"]*fl-node-' + node + r'"[^>]*>').search(html)
    start = m.end()
    # The next thing the layout opens (another module, column or row), or the end of the layout.
    nxt = re.compile(r'<div\s+(?:id="[^"]*"\s+)?class="fl-(module|col|col-group|row) ').search(html, start)
    n = closes_after(nodes, node)
    if nxt:
        stop = nxt.start()
    else:
        # The last module: after the layout come Beaver Builder's own wrapper and Astra's entry-content div.
        stop = html.index("<!-- .entry-content .clear -->", start)
        n += 2
    seg = html[start:stop]
    k = len(seg)
    for _ in range(n):
        t = seg[:k].rstrip()
        # Beaver Builder prints a module's animation <style> between layout elements.
        while t.endswith("</style>"):
            t = t[: t.rindex("<style")].rstrip()
        if not t.endswith("</div>"):
            raise ValueError(f"{node}: expected {n} closing </div>s before the next layout element")
        k = len(t) - len("</div>")
    return start, start + k


out, module_text, module_type = {}, {}, {}
for key, (fname, pid) in PAGES.items():
    h = open(f"{src_dir}/{fname}", encoding="utf-8").read()
    head = strip(h[: h.index("</head>")], DROP_HEAD)
    # Site Kit's Google tags ran for signed-out visitors only ("exclude logged-in users"): a hole the Worker fills.
    sk = re.findall(r'<script defer id="google_gtagjs-js"[^>]*></script>|<script defer id="google_gtagjs-js-after">.*?</script>|<!-- Google Tag Manager snippet added by Site Kit -->.*?<!-- End Google Tag Manager snippet added by Site Kit -->', head, flags=re.S)
    if key == "home":
        out["SITEKIT_HEAD"] = "".join(sk)
    for x in sk:
        head = head.replace(x, "", 1)
    head = head.replace("</title>", "</title>__SITEKIT_HEAD__", 1)
    head = re.sub(r"<title>.*?</title>", "<title>__TITLE__</title>", head, flags=re.S)
    body = h[h.index("<body"):]
    # Holes for the shortcode modules, last first so earlier offsets stay valid.
    spans = []
    for n in bb[pid]["nodes"]:
        st = n["settings"]
        txt = st.get("text") or st.get("html") or ""
        # Shortcodes inside HTML comments never ran (WordPress leaves comments alone).
        live = re.sub(r"<!--.*?-->", "", txt, flags=re.S)
        if n["type"] == "module" and re.search(r"\[(gff_[a-z_]+|aerial_timelapse|woocommerce_my_account)", live):
            a, b = module_inner_span(body, n["node"], bb[pid]["nodes"])
            spans.append((a, b, n["node"]))
            module_text[n["node"]] = txt
            module_type[n["node"]] = st.get("type", "")
    for a, b, node in sorted(spans, reverse=True):
        body = body[:a] + f"__MODULE_{node}__" + body[b:]
    body = strip(body, DROP_FOOT)
    m = re.search(r"<!-- Google Tag Manager \(noscript\) snippet added by Site Kit -->.*?<!-- End Google Tag Manager \(noscript\) snippet added by Site Kit -->", body, flags=re.S)
    if m:
        out["SITEKIT_BODY"] = m.group(0)
        body = body.replace(m.group(0), "__SITEKIT_BODY__", 1)
    out[key.upper() + "_HEAD"] = head
    out[key.upper() + "_BODY"] = body[: body.rindex("</html>")]

# Local files the kept markup loads (to copy into public/).
files = sorted(set(re.findall(r"https://gawlakfamilyfarms\.com(/(?:wp-content|wp-includes|go)/[^\"')\s?#]+)", "".join(out.values()))))
with open(out_path, "w", encoding="utf-8") as f:
    f.write("/* Generated by scripts/gen-shell.py from gawlakfamilyfarms.com's own pages (Astra + Beaver Builder). Do not edit. */\n")
    for k, v in out.items():
        f.write(f"export const {k} = {json.dumps(v, ensure_ascii=False)};\n")
    f.write(f"export const MODULE_TEXT: Record<string, string> = {json.dumps(module_text, ensure_ascii=False)};\n")
    f.write(f"export const MODULE_TYPE: Record<string, string> = {json.dumps(module_type)};\n")
    f.write(f"export const FILES = {json.dumps(files)};\n")
for k, v in out.items():
    print(f"{k:14} {len(v):7d}")
print(len(files), "local files;", len(module_text), "shortcode modules")
