"""Convert MP4 videos to WebM (VP9 + Opus) siblings, using the ffmpeg binary
shipped by the imageio-ffmpeg package (no system install required).

For each .mp4 in assets/ that's referenced by an HTML page:
  - Writes <name>.webm next to it
  - Skips if .webm already exists and is newer than the source
  - Skips files smaller than MIN_BYTES (overhead not worth it)

Quality target: -crf 33 (VP9 sweet spot for muted background loops).

Run: python tools/convert_videos.py [--dry-run] [--min-kb 200]
"""
import argparse, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def find_referenced_mp4s(root: Path):
    haystack = []
    for ext in ("*.html", "*.css"):
        for p in root.rglob(ext):
            try:
                haystack.append(p.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                pass
    text = "\n".join(haystack)
    out = []
    for mp4 in (root / "assets").rglob("*.mp4"):
        rel = mp4.relative_to(root).as_posix()
        if rel in text or mp4.name in text:
            out.append(mp4)
    return sorted(out)

def encode_webm(ffmpeg: str, src: Path, crf: int) -> tuple[Path, int]:
    out = src.with_suffix(".webm")
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return out, out.stat().st_size
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-i", str(src),
        "-c:v", "libvpx-vp9",
        "-b:v", "0",
        "-crf", str(crf),
        "-row-mt", "1",
        "-deadline", "good",
        "-cpu-used", "4",   # speed/quality tradeoff (0=best/slow, 5=fast)
        "-an",              # drop audio (these are decorative loops)
        str(out),
    ]
    subprocess.run(cmd, check=True)
    return out, out.stat().st_size

def main():
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-kb", type=int, default=200)
    ap.add_argument("--crf", type=int, default=33)
    args = ap.parse_args()

    videos = find_referenced_mp4s(ROOT)
    print(f"found {len(videos)} referenced .mp4 files")

    converted = 0
    saved = 0
    skipped = 0
    for src in videos:
        s = src.stat().st_size
        if s < args.min_kb * 1024:
            skipped += 1
            continue
        rel = src.relative_to(ROOT).as_posix()
        if args.dry_run:
            print(f"  would convert: {rel} ({s//1024} KB)")
            continue
        print(f"  encoding: {rel} ({s//1024} KB) ...", flush=True)
        out, w = encode_webm(ffmpeg, src, args.crf)
        saved += s - w
        converted += 1
        print(f"    {rel} -> {out.name}: {w//1024} KB ({(w*100)//s}% of mp4)")
    if not args.dry_run:
        print(f"\n{converted} converted, {skipped} skipped (<{args.min_kb}KB)")
        print(f"saved (vs. mp4): {saved/1048576:.1f} MB")

if __name__ == "__main__":
    main()
