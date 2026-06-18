"""Rename files containing spaces to snake_case (PhyntomX8/) or kebab-case (logos),
and patch all references in HTML/CSS.

Idempotent: skips renames whose target already exists (and warns).

Run: python tools/rename_spaced_files.py
"""
import re, sys, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (oldRel -> newRel) — relative to ROOT, posix style
RENAMES = {
    "assets/Mega X-logo-light.png":         "assets/mega-x-logo-light.png",
    "assets/Mega X-logo-light-circle.png":  "assets/mega-x-logo-light-circle.png",
    "assets/MegaX logo.svg":                "assets/megax-logo.svg",
    "assets/PhyntomX8/record studio.png":   "assets/PhyntomX8/record_studio.png",
    # Files referenced in phyntom-x8.html (snake_case across .png/.avif/.webp/.jpeg/.mp4)
    "assets/PhyntomX8/design studio.png":   "assets/PhyntomX8/design_studio.png",
    "assets/PhyntomX8/design studio.avif":  "assets/PhyntomX8/design_studio.avif",
    "assets/PhyntomX8/design studio.webp":  "assets/PhyntomX8/design_studio.webp",
    "assets/PhyntomX8/game studio.png":     "assets/PhyntomX8/game_studio.png",
    "assets/PhyntomX8/game studio.avif":    "assets/PhyntomX8/game_studio.avif",
    "assets/PhyntomX8/game studio.webp":    "assets/PhyntomX8/game_studio.webp",
    "assets/PhyntomX8/stage design.jpeg":   "assets/PhyntomX8/stage_design.jpeg",
    "assets/PhyntomX8/stage design.avif":   "assets/PhyntomX8/stage_design.avif",
    "assets/PhyntomX8/stage design.webp":   "assets/PhyntomX8/stage_design.webp",
    "assets/PhyntomX8/hero x8.mp4":         "assets/PhyntomX8/hero_x8.mp4",
}

def rename_files():
    moved = 0
    for old, new in RENAMES.items():
        old_p = ROOT / old
        new_p = ROOT / new
        if not old_p.exists():
            if new_p.exists():
                print(f"  already renamed: {old} -> {new}")
            else:
                print(f"  WARN: source missing: {old}")
            continue
        if new_p.exists():
            print(f"  WARN: target exists, leaving source: {new}")
            continue
        new_p.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_p), str(new_p))
        print(f"  renamed: {old} -> {new}")
        moved += 1
    return moved

def patch_text_refs():
    # Build search patterns from old basenames
    # Replace exact path occurrences first (avoid greedy partial matches)
    files_to_scan = (
        list(ROOT.glob("*.html")) +
        list((ROOT / "products").glob("*.html")) +
        list((ROOT / "partials").glob("*.html")) +
        list((ROOT / "styles").rglob("*.css"))
    )
    patches = 0
    for path in files_to_scan:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        orig = text
        for old, new in RENAMES.items():
            old_basename = old.split("/")[-1]
            new_basename = new.split("/")[-1]
            # Replace full path first, then basename (in case it appears bare)
            text = text.replace(old, new)
            text = text.replace(old_basename, new_basename)
        if text != orig:
            path.write_text(text, encoding="utf-8")
            print(f"  patched refs: {path.relative_to(ROOT)}")
            patches += 1
    return patches

def main():
    moved = rename_files()
    patches = patch_text_refs()
    print(f"\n{moved} files renamed, {patches} text files patched.")

if __name__ == "__main__":
    main()
