"""Wrap <img src="x.png|jpg|jpeg"> with <picture><source avif><source webp><img …></picture>
when sibling x.avif and x.webp exist.

Also adds:
  - decoding="async" if missing
  - loading="lazy" if missing AND the img is NOT one of the configured "eager" images
    (hero / above-the-fold images get loading="eager" and fetchpriority="high" instead)

Idempotent: detects existing <picture> wrapper and skips.

Run: python tools/upgrade_images.py
"""
import re, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(
    list(ROOT.glob("*.html"))
    + list((ROOT / "products").glob("*.html"))
    + list((ROOT / "partials").glob("*.html"))
)

# Image src patterns that should be loaded eagerly with high priority (hero / above-the-fold).
EAGER_IMAGES = {
    # navigation/branding always above fold
    "assets/logo-nav.png",
    "assets/logo-loader.png",
    # known hero patterns (above-the-fold backgrounds)
    "assets/hero-bg.png",
    "assets/Gamehero.png",
}

IMG_RE = re.compile(
    r'(?P<full><img\s+(?P<attrs>[^>]*?)src="(?P<src>[^"]+\.(png|jpg|jpeg))"(?P<after>[^>]*)>)',
    re.IGNORECASE,
)

def has_attr(attrs: str, name: str) -> bool:
    return re.search(rf'\b{name}\s*=', attrs) is not None

def upgrade_one(match, html_path: Path, ctx: dict) -> str:
    full = match.group("full")
    attrs_before = match.group("attrs") or ""
    src = match.group("src")
    attrs_after = match.group("after") or ""
    full_attrs = (attrs_before + " " + attrs_after).strip()

    # Resolve sibling avif/webp paths relative to file system
    if html_path.parent.name == "products":
        # src may be relative like ../assets/xxx
        base_dir = (html_path.parent / src).parent.resolve()
        stem = Path(src).stem
    elif html_path.parent.name == "partials":
        # partials are injected into root pages, so src like "assets/xxx" is relative to ROOT
        base_dir = (ROOT / src).parent
        stem = Path(src).stem
    else:
        base_dir = (ROOT / src).parent
        stem = Path(src).stem

    avif_path = base_dir / f"{stem}.avif"
    webp_path = base_dir / f"{stem}.webp"
    have_siblings = avif_path.exists() and webp_path.exists()

    src_dir = str(Path(src).parent).replace("\\", "/")
    if src_dir == ".":
        src_dir = ""
    elif not src_dir.endswith("/"):
        src_dir += "/"
    avif_url = src_dir + f"{stem}.avif"
    webp_url = src_dir + f"{stem}.webp"

    # Build new <img> attrs: keep originals, ensure decoding=async; loading lazy/eager + priority
    new_attrs = attrs_before
    after = attrs_after
    is_eager = src in EAGER_IMAGES
    # Inject decoding=async if missing
    if not has_attr(full_attrs, "decoding"):
        after = after.rstrip() + ' decoding="async"'
    if is_eager:
        # ensure no loading=lazy; add fetchpriority=high if missing
        after = re.sub(r'\sloading="lazy"', '', after)
        new_attrs = re.sub(r'\sloading="lazy"', '', new_attrs)
        if not has_attr(full_attrs, "fetchpriority"):
            after = after.rstrip() + ' fetchpriority="high"'
        if not has_attr(full_attrs, "loading"):
            after = after.rstrip() + ' loading="eager"'
    else:
        if not has_attr(full_attrs, "loading"):
            after = after.rstrip() + ' loading="lazy"'

    new_img = f'<img {new_attrs}src="{src}"{(" " + after.strip()) if after.strip() else ""}>'
    new_img = re.sub(r'\s+', ' ', new_img).replace(' >', '>').replace('< ', '<')
    # Restore proper "src=" (no leading space damage)
    new_img = new_img.replace('<img  src=', '<img src=').replace('<img >', '<img>')

    # If no AVIF/WebP siblings exist, just emit the upgraded <img> without <picture>
    if not have_siblings:
        # Only return changed text if we actually added attrs — else keep original
        if new_img != full:
            return new_img
        return full

    return (
        f'<picture>'
        f'<source type="image/avif" srcset="{avif_url}">'
        f'<source type="image/webp" srcset="{webp_url}">'
        f'{new_img}'
        f'</picture>'
    )

# Skip <img> that's already inside a <picture>
PICTURE_RE = re.compile(r'<picture>.*?</picture>', re.DOTALL)

def process(html_path: Path) -> bool:
    text = html_path.read_text(encoding="utf-8")
    orig = text

    # Mask out existing <picture> blocks so their inner <img> isn't re-wrapped
    masks = []
    def mask(m):
        masks.append(m.group(0))
        return f"\x00MASK{len(masks)-1}\x00"
    text = PICTURE_RE.sub(mask, text)

    text = IMG_RE.sub(lambda m: upgrade_one(m, html_path, {}), text)

    # Restore masks
    def unmask(m):
        return masks[int(m.group(1))]
    text = re.sub(r"\x00MASK(\d+)\x00", unmask, text)

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
