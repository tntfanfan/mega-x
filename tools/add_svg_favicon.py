"""Add <link rel="icon" type="image/svg+xml" href="..."> to every page that
has the existing ICO/PNG favicon links, for modern-browser SVG support.

Idempotent: skips pages that already have the SVG link.

Run: python tools/add_svg_favicon.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(list(ROOT.glob("*.html")) + list((ROOT / "products").glob("*.html")))

ICO_LINE_RE = re.compile(
    r'^([ \t]*)<link\s+rel="icon"\s+href="([^"]*?)final-favicon\.ico"[^>]*>',
    re.MULTILINE,
)

def process(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if 'rel="icon" type="image/svg+xml"' in text:
        return False  # already has SVG favicon
    m = ICO_LINE_RE.search(text)
    if not m:
        return False
    indent = m.group(1)
    href_prefix = m.group(2)  # "" for root pages, "../assets/" for products/
    # favicon.svg lives at site root.
    # Root pages: href = "favicon.svg"
    # products/  pages: href = "../favicon.svg"
    if href_prefix.startswith("../"):
        svg_href = "../favicon.svg"
    else:
        svg_href = "favicon.svg"
    new_link = f'{indent}<link rel="icon" type="image/svg+xml" href="{svg_href}">\n'
    new_text = text[:m.start()] + new_link + text[m.start():]
    path.write_text(new_text, encoding="utf-8")
    return True

def main():
    n = 0
    for html in HTML_FILES:
        if process(html):
            print(f"  added SVG favicon: {html.relative_to(ROOT)}")
            n += 1
        else:
            print(f"  unchanged: {html.relative_to(ROOT)}")
    print(f"\n{n} files updated.")

if __name__ == "__main__":
    main()
