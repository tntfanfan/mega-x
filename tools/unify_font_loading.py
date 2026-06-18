"""Unify Google Fonts loading: convert blocking <link rel="stylesheet" href="fonts.googleapis…">
to async pattern (preload + media=print onload + noscript fallback).

Idempotent: skips files where the optimization is already present.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(list(ROOT.glob("*.html")) + list((ROOT / "products").glob("*.html")))

# Match a blocking Google Fonts stylesheet link that DOES NOT already have media="print" or noscript wrapping.
# Pattern: <link rel="stylesheet" href="https://fonts.googleapis.com/...">  (single line, possibly indented)
LINK_RE = re.compile(
    r'^([ \t]*)<link\s+(?:href="(https://fonts\.googleapis\.com/[^"]+)"\s+rel="stylesheet"|rel="stylesheet"\s+href="(https://fonts\.googleapis\.com/[^"]+)")\s*>\n',
    re.MULTILINE,
)

def transform(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    # Already optimized if there's a media="print" line referencing fonts.googleapis
    if re.search(r'media="print"\s+onload="this\.media=\'all\'"', text):
        # Still might be a 404 or products page that has BOTH a blocking link and an optimized one.
        # Only skip if no blocking simple stylesheet line remains.
        if not LINK_RE.search(text):
            return False

    m = LINK_RE.search(text)
    if not m:
        return False
    indent = m.group(1)
    url = m.group(2) or m.group(3)
    block = (
        f'{indent}<link rel="preload" as="style" href="{url}">\n'
        f'{indent}<link rel="stylesheet" href="{url}" media="print" onload="this.media=\'all\'">\n'
        f'{indent}<noscript><link rel="stylesheet" href="{url}"></noscript>\n'
    )
    new_text = LINK_RE.sub(block, text, count=1)
    path.write_text(new_text, encoding="utf-8")
    return True

def main():
    n = 0
    for html in HTML_FILES:
        if transform(html):
            print(f"  optimized: {html.relative_to(ROOT)}")
            n += 1
        else:
            print(f"  skipped (already async or no fonts): {html.relative_to(ROOT)}")
    print(f"\n{n} files updated.")

if __name__ == "__main__":
    main()
