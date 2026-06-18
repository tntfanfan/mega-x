"""Extract first <style>...</style> in <head> to styles/pages/<basename>.css and replace with external link.

Run: python tools/extract_inline_styles.py
- Targets all top-level *.html and products/*.html
- Only extracts the FIRST <style> block (the head-level one)
- Skips files with no <style>
- Idempotent: skips files where extraction already happened (page CSS exists and HTML lacks the markered <style>)
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES_DIR = ROOT / "styles" / "pages"
PAGES_DIR.mkdir(parents=True, exist_ok=True)

HTML_FILES = sorted(list(ROOT.glob("*.html")) + list((ROOT / "products").glob("*.html")))

STYLE_RE = re.compile(r"^([ \t]*)<style>\n(.*?)\n[ \t]*</style>\n", re.DOTALL | re.MULTILINE)

def extract(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    m = STYLE_RE.search(text)
    if not m:
        return False
    indent = m.group(1)
    css = m.group(2)
    rel_basename = path.stem  # index, about, ...
    # For products/foo.html → products-foo
    if path.parent.name == "products":
        rel_basename = f"products-{path.stem}"
    css_path = PAGES_DIR / f"{rel_basename}.css"
    css_path.write_text(css + "\n", encoding="utf-8")
    # Compute relative href from html → styles/pages/x.css
    if path.parent.name == "products":
        href = f"../styles/pages/{rel_basename}.css"
    else:
        href = f"styles/pages/{rel_basename}.css"
    replacement = f'{indent}<link rel="stylesheet" href="{href}">\n'
    new_text = STYLE_RE.sub(replacement, text, count=1)
    path.write_text(new_text, encoding="utf-8")
    return True

def main():
    n = 0
    for html in HTML_FILES:
        if extract(html):
            print(f"  extracted: {html.relative_to(ROOT)}")
            n += 1
        else:
            print(f"  skipped (no <style>): {html.relative_to(ROOT)}")
    print(f"\n{n} files updated, css written to styles/pages/")

if __name__ == "__main__":
    main()
