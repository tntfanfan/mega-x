"""Build styles/bundle.min.css from split sources, properly minified.

Inputs (in order):
  styles/variables.css
  styles/base.css
  styles/components.css
  styles/animations.css
  styles/utilities.css

Output:
  styles/bundle.min.css

Uses rcssmin (pure-Python, regex-based, conservative). The split sources stay
as the source of truth — bundle.min.css is a generated artifact.

Run: python tools/build_css.py
"""
import sys
from pathlib import Path

try:
    import rcssmin
except ImportError:
    print("ERROR: pip install --user rcssmin", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "styles"
SOURCES = [
    STYLES / "variables.css",
    STYLES / "base.css",
    STYLES / "components.css",
    STYLES / "animations.css",
    STYLES / "utilities.css",
]
OUT = STYLES / "bundle.min.css"

def main():
    parts = []
    for src in SOURCES:
        if not src.exists():
            print(f"  WARN: missing {src.relative_to(ROOT)}")
            continue
        parts.append(f"/* {src.name} */")
        parts.append(src.read_text(encoding="utf-8"))
    raw = "\n".join(parts)
    minified = rcssmin.cssmin(raw)
    OUT.write_text(minified, encoding="utf-8")
    raw_size = sum(s.stat().st_size for s in SOURCES if s.exists())
    out_size = OUT.stat().st_size
    pct = (out_size * 100) // raw_size if raw_size else 0
    print(f"  wrote {OUT.relative_to(ROOT)}: {out_size} bytes ({pct}% of {raw_size}-byte source)")

if __name__ == "__main__":
    main()
