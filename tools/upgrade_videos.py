"""For every <source ... .mp4 ...> in HTML, prepend a sibling <source ... .webm>
when the corresponding .webm sibling exists on disk.

Result example:
  <video ...>
    <source data-src="assets/city-rotate.webm" type="video/webm">
    <source data-src="assets/city-rotate.mp4"  type="video/mp4">
  </video>

Browsers pick the first supported `<source>`, so WebM-capable browsers
(Chromium, Firefox, recent Safari) use VP9 + Opus; older fall back to MP4.

Idempotent: skips <video> blocks that already include a webm source.

Run: python tools/upgrade_videos.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(list(ROOT.glob("*.html")) + list((ROOT / "products").glob("*.html")))

# Match a <source> tag pointing at .mp4. Capture the same src/data-src attribute name.
SOURCE_RE = re.compile(
    r'(?P<full><source\s+(?P<attrs>(?:[^>]*?))(?P<srcattr>(?:src|data-src))="(?P<href>[^"]+\.mp4)"\s+type="video/mp4"\s*>)',
    re.IGNORECASE,
)

VIDEO_BLOCK_RE = re.compile(r'<video[^>]*>(.*?)</video>', re.DOTALL | re.IGNORECASE)

def webm_for_path(html_path: Path, mp4_href: str) -> Path:
    if html_path.parent.name == "products":
        base = (html_path.parent / mp4_href).parent.resolve()
    else:
        base = (ROOT / mp4_href).parent
    stem = Path(mp4_href).stem
    return base / f"{stem}.webm"

def process(html_path: Path) -> bool:
    text = html_path.read_text(encoding="utf-8")
    orig = text

    def upgrade_block(m):
        block = m.group(0)
        # Skip if a webm source already exists in this <video> block
        if 'type="video/webm"' in block:
            return block
        # Find each mp4 source and prepend a webm sibling on the same line
        def make_pair(sm):
            attrs = sm.group("attrs") or ""
            srcattr = sm.group("srcattr")
            mp4_href = sm.group("href")
            # Compute webm path on disk + URL
            webm_disk = webm_for_path(html_path, mp4_href)
            if not webm_disk.exists():
                return sm.group("full")
            webm_url = mp4_href[: -len("mp4")] + "webm"
            webm_tag = f'<source {attrs}{srcattr}="{webm_url}" type="video/webm">'
            mp4_tag = sm.group("full")
            return f"{webm_tag}\n            {mp4_tag}"
        return SOURCE_RE.sub(make_pair, block)

    text = VIDEO_BLOCK_RE.sub(upgrade_block, text)

    if text != orig:
        html_path.write_text(text, encoding="utf-8")
        return True
    return False

def main():
    n = 0
    for html in HTML_FILES:
        if process(html):
            print(f"  upgraded: {html.relative_to(ROOT)}")
            n += 1
        else:
            print(f"  unchanged: {html.relative_to(ROOT)}")
    print(f"\n{n} files updated.")

if __name__ == "__main__":
    main()
