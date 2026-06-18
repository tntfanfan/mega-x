"""Convert referenced PNG/JPG/JPEG images to AVIF + WebP siblings.

For each input image:
  - Writes <name>.avif and <name>.webp next to the original
  - Skips if both already exist and are newer than the source
  - Skips images smaller than MIN_BYTES (overhead not worth it)
  - Skips images NOT referenced in any HTML/CSS

Quality defaults to 80 (AVIF) / 82 (WebP) — visually lossless for marketing.

Run: python tools/convert_images.py [--dry-run] [--min-kb 30]
"""
import argparse, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = [ROOT / "assets"]   # team/, PhyntomX8/, fann/, image_set/, hero-bg.png …

def find_referenced(root: Path):
    """Yield Path of every PNG/JPG/JPEG that appears in any HTML or CSS file."""
    referenced = set()
    haystacks = []
    for ext in ("*.html", "*.css"):
        haystacks.extend(root.rglob(ext))
    blob = []
    for h in haystacks:
        try:
            blob.append(h.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            pass
    text = "\n".join(blob)
    for d in SCAN_DIRS:
        for img in d.rglob("*"):
            if not img.is_file():
                continue
            if img.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            rel = img.relative_to(root).as_posix()
            base = img.name
            if rel in text or base in text:
                referenced.add(img)
    return sorted(referenced)

def convert(src: Path, fmt: str, quality: int) -> tuple[Path, int]:
    from PIL import Image
    import pillow_avif  # noqa: F401  registers AVIF codec
    out = src.with_suffix("." + fmt)
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return out, out.stat().st_size  # already up-to-date
    with Image.open(src) as im:
        if im.mode in ("P", "LA", "RGBA"):
            # PNG with palette/alpha: AVIF supports it; for JPEG fallback to RGB
            if fmt == "webp":
                im.save(out, "WEBP", quality=quality, method=6)
            else:
                im.save(out, "AVIF", quality=quality)
        else:
            if im.mode != "RGB":
                im = im.convert("RGB")
            if fmt == "webp":
                im.save(out, "WEBP", quality=quality, method=6)
            else:
                im.save(out, "AVIF", quality=quality)
    return out, out.stat().st_size

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-kb", type=int, default=30, help="skip files smaller than this (KB)")
    ap.add_argument("--avif-quality", type=int, default=60)
    ap.add_argument("--webp-quality", type=int, default=82)
    args = ap.parse_args()

    files = find_referenced(ROOT)
    print(f"found {len(files)} referenced PNG/JPG/JPEG files")

    converted = 0
    saved_avif = saved_webp = 0
    skipped_small = 0
    for src in files:
        s = src.stat().st_size
        if s < args.min_kb * 1024:
            skipped_small += 1
            continue
        rel = src.relative_to(ROOT).as_posix()
        if args.dry_run:
            print(f"  would convert: {rel} ({s//1024} KB)")
            continue
        avif_out, av = convert(src, "avif", args.avif_quality)
        webp_out, wp = convert(src, "webp", args.webp_quality)
        saved_avif += s - av
        saved_webp += s - wp
        converted += 1
        print(f"  {rel}: orig {s//1024}KB  avif {av//1024}KB ({(av*100)//s}%)  webp {wp//1024}KB ({(wp*100)//s}%)")
    if not args.dry_run:
        print(f"\n{converted} converted, {skipped_small} skipped (<{args.min_kb}KB)")
        print(f"saved (vs. orig): avif {saved_avif/1048576:.1f} MB, webp {saved_webp/1048576:.1f} MB")

if __name__ == "__main__":
    main()
