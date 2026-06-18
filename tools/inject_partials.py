"""Inject partials (nav, mobile-menu, footer, seo) into pages based on partials/pages.json.

Idempotent. Two-mode:
  - First run on a page that has no markers: locates the existing block by
    its opening tag (or, for SEO, a heuristic over <title>/<meta>),
    wraps it with <!-- partial:NAME --> ... <!-- /partial:NAME -->,
    then replaces the body with the rendered partial.
  - Subsequent runs: replaces body between existing markers with rendered partial.

Run: python tools/inject_partials.py
"""
import json, re
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "partials"
PAGES_JSON = PARTIALS / "pages.json"

NAV_OPEN_RE   = re.compile(r"^[ \t]*<nav[^>]*aria-label=\"Main navigation\"[^>]*>", re.MULTILINE)
NAV_CLOSE     = "</nav>"
MOBILE_OPEN_RE = re.compile(r"^[ \t]*<div class=\"mobile-menu\"[^>]*>", re.MULTILINE)
MOBILE_CLOSE  = "</div>"
FOOTER_OPEN_RE = re.compile(r"^[ \t]*<footer[^>]*>", re.MULTILINE)
FOOTER_CLOSE  = "</footer>"

# SEO heuristic: a contiguous block starting at <title> spanning <title> + optional meta/link siblings (description, og:*, twitter:*, canonical)
SEO_LEGACY_RE = re.compile(
    r"^[ \t]*<title>.*?</title>\n"
    r"(?:[ \t]*<(?:meta|link)[^>]*(?:name=\"description\"|property=\"og:[^\"]+\"|name=\"twitter:[^\"]+\"|rel=\"canonical\")[^>]*>\n)*"
    r"(?:\n)?",
    re.MULTILINE,
)

def find_block_end(text: str, start: int, close_tag: str) -> int:
    idx = text.find(close_tag, start)
    if idx == -1:
        return -1
    eol = text.find("\n", idx + len(close_tag))
    return eol + 1 if eol != -1 else len(text)

def render_nav(cfg: dict) -> str:
    tpl = (PARTIALS / "nav.html").read_text(encoding="utf-8").rstrip("\n")
    nav_extra = f" {cfg['navExtraClass']}" if cfg.get("navExtraClass") else ""
    tpl = tpl.replace("{{nav-extra-class}}", nav_extra)
    if cfg.get("homeInNav", True):
        tpl = tpl.replace("{{home-li}}", '<li><a href="index.html"' + active_attr("home", cfg.get("active")) + ">Home</a></li>")
    else:
        tpl = re.sub(r"\n[ \t]*\{\{home-li\}\}", "", tpl)
    tpl = re.sub(r"\{\{active:([a-z0-9-]+)\}\}", lambda m: active_attr(m.group(1), cfg.get("active")), tpl)
    return tpl

def active_attr(item: str, active) -> str:
    return ' style="color:var(--color-primary);"' if active and item == active else ""

def render_mobile(cfg: dict) -> str:
    tpl = (PARTIALS / "mobile-menu.html").read_text(encoding="utf-8").rstrip("\n")
    if cfg.get("homeInMobile", True):
        tpl = tpl.replace("{{home-link}}", '<a href="index.html">Home</a>')
    else:
        tpl = re.sub(r"\n[ \t]*\{\{home-link\}\}", "", tpl)
    return tpl

def render_footer(cfg: dict, defaults: dict) -> str:
    tpl = (PARTIALS / "footer.html").read_text(encoding="utf-8").rstrip("\n")
    tagline = cfg.get("tagline") or defaults.get("tagline", "")
    return tpl.replace("{{tagline}}", tagline)

def render_seo(rel: str, cfg: dict, defaults: dict) -> str:
    tpl = (PARTIALS / "seo.html").read_text(encoding="utf-8").rstrip("\n")
    site_url = defaults.get("siteUrl", "").rstrip("/")
    canonical_path = cfg.get("canonical") or "/" + rel.replace("\\", "/")
    canonical_url = site_url + canonical_path
    og_image_path = cfg.get("ogImage") or defaults.get("ogImage", "")
    og_image_url = site_url + "/" + og_image_path.lstrip("/") if og_image_path else ""
    twitter_card = cfg.get("twitterCard") or defaults.get("twitterCard", "summary_large_image")
    robots = '<meta name="robots" content="noindex">' if cfg.get("noindex") else ""
    title = cfg.get("title", "")
    description = cfg.get("description", "")
    og_title = cfg.get("ogTitle") or title
    og_description = cfg.get("ogDescription") or description
    return (
        tpl.replace("{{title}}", title)
           .replace("{{description}}", description)
           .replace("{{canonicalUrl}}", canonical_url)
           .replace("{{ogTitle}}", og_title)
           .replace("{{ogDescription}}", og_description)
           .replace("{{ogImageUrl}}", og_image_url)
           .replace("{{twitterCard}}", twitter_card)
           .replace("{{robots}}", robots)
    )

def wrap_or_replace(text: str, name: str, body: str, opener_re: re.Pattern, close_tag: str):
    open_marker = f"<!-- partial:{name} -->"
    close_marker = f"<!-- /partial:{name} -->"
    marker_re = re.compile(
        rf"(?P<lead>[ \t]*){re.escape(open_marker)}\n.*?\n[ \t]*{re.escape(close_marker)}",
        re.DOTALL,
    )
    if marker_re.search(text):
        new_text = marker_re.sub(lambda m: f"{m.group('lead')}{open_marker}\n{body}\n{m.group('lead')}{close_marker}", text)
        return new_text, new_text != text
    m = opener_re.search(text)
    if not m:
        return text, False
    start = m.start()
    end = find_block_end(text, start, close_tag)
    if end == -1:
        return text, False
    line_start = text.rfind("\n", 0, start) + 1
    indent = text[line_start:start]
    replacement = f"{indent}{open_marker}\n{body}\n{indent}{close_marker}\n"
    return text[:line_start] + replacement + text[end:], True

def wrap_or_replace_seo(text: str, body: str):
    """SEO uses a regex over a multi-line legacy block instead of a single opener tag."""
    open_marker = "<!-- partial:seo -->"
    close_marker = "<!-- /partial:seo -->"
    marker_re = re.compile(
        rf"(?P<lead>[ \t]*){re.escape(open_marker)}\n.*?\n[ \t]*{re.escape(close_marker)}",
        re.DOTALL,
    )
    if marker_re.search(text):
        new_text = marker_re.sub(lambda m: f"{m.group('lead')}{open_marker}\n{body}\n{m.group('lead')}{close_marker}", text)
        return new_text, new_text != text
    # Legacy: contiguous title+description+og lines
    m = SEO_LEGACY_RE.search(text)
    if not m:
        return text, False
    line_start = m.start()
    end = m.end()
    indent_match = re.match(r"^([ \t]*)", text[line_start:line_start + 80])
    indent = indent_match.group(1) if indent_match else "  "
    replacement = f"{indent}{open_marker}\n{body}\n{indent}{close_marker}\n"
    return text[:line_start] + replacement + text[end:], True

def remove_partial(text: str, name: str):
    open_marker = f"<!-- partial:{name} -->"
    close_marker = f"<!-- /partial:{name} -->"
    marker_re = re.compile(
        rf"[ \t]*{re.escape(open_marker)}\n.*?\n[ \t]*{re.escape(close_marker)}\n?",
        re.DOTALL,
    )
    if marker_re.search(text):
        return marker_re.sub("", text), True
    return text, False

def process(rel: str, html_path: Path, cfg: dict, defaults: dict) -> bool:
    text = html_path.read_text(encoding="utf-8")
    orig = text

    if cfg.get("renderNav", True):
        text, _ = wrap_or_replace(text, "nav", render_nav(cfg), NAV_OPEN_RE, NAV_CLOSE)
        text, _ = wrap_or_replace(text, "mobile-menu", render_mobile(cfg), MOBILE_OPEN_RE, MOBILE_CLOSE)
    else:
        text, _ = remove_partial(text, "nav")
        text, _ = remove_partial(text, "mobile-menu")

    if cfg.get("renderFooter", True):
        text, _ = wrap_or_replace(text, "footer", render_footer(cfg, defaults), FOOTER_OPEN_RE, FOOTER_CLOSE)
    else:
        text, _ = remove_partial(text, "footer")

    if cfg.get("title"):
        text, _ = wrap_or_replace_seo(text, render_seo(rel, cfg, defaults))

    if text != orig:
        html_path.write_text(text, encoding="utf-8")
        return True
    return False

def main():
    pages = json.loads(PAGES_JSON.read_text(encoding="utf-8"))
    defaults = pages.pop("_default", {})
    n = 0
    for rel, cfg in pages.items():
        path = ROOT / rel
        if not path.exists():
            print(f"  WARN: {rel} not found")
            continue
        if process(rel, path, cfg, defaults):
            print(f"  updated: {rel}")
            n += 1
        else:
            print(f"  unchanged: {rel}")
    print(f"\n{n} files updated.")

if __name__ == "__main__":
    main()
