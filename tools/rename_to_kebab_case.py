"""Rename non-kebab folders/files in the mega-x project to kebab-case + patch refs.

Scope (audited 2026-06-18):

  Folders:
    assets/PhyntomX8/   -> assets/phyntom-x8/
    assets/image_set/   -> assets/image-set/

  Files (PascalCase or snake_case_at_top -> kebab-case):
    assets/City_rotate*           -> assets/city-rotate*
    assets/Get_moving*            -> assets/get-moving*
    assets/Gamehero.*             -> assets/game-hero.*
    assets/MegaX_logo2.png        -> assets/mega-x-logo2.png
    assets/MegaX_logo2_circle.png -> assets/mega-x-logo2-circle.png
    assets/bighand_poster*        -> assets/bighand-poster*
    assets/chipfactory_poster*    -> assets/chipfactory-poster*
    assets/think_poster*          -> assets/think-poster*
    assets/wifichip_poster*       -> assets/wifichip-poster*
    assets/mega_logo_clean_vector.svg -> assets/mega-logo-clean-vector.svg
    assets/mega_x_holdings_hybrid.svg -> assets/mega-x-holdings-hybrid.svg
    assets/phyntom-x8/design_studio.* -> assets/phyntom-x8/design-studio.*  (post-folder-rename)
    assets/phyntom-x8/game_studio.*   -> assets/phyntom-x8/game-studio.*
    assets/phyntom-x8/stage_design.*  -> assets/phyntom-x8/stage-design.*
    assets/phyntom-x8/hero_x8.mp4     -> assets/phyntom-x8/hero-x8.mp4
    assets/phyntom-x8/record_studio.png -> assets/phyntom-x8/record-studio.png

  Out of scope (keep as-is, with rationale):
    - tools/*.py         -> Python modules use snake_case (PEP 8)
    - products/_layout.css -> SCSS-style partial leading underscore is intentional
    - assets/phyntom-x8/cropped/a_01.png …b_37.png -> short alpha+digit
      identifiers commonly use _ as separator; treating these as one token

After folder rename, all old paths are dead. Pre-rename refs in HTML/CSS
are patched to the new paths in one pass.

Run: python tools/rename_to_kebab_case.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FOLDER_RENAMES = [
    ("assets/PhyntomX8", "assets/phyntom-x8"),
    ("assets/image_set", "assets/image-set"),
]

# Each entry: (oldRel, newRel) — applied AFTER folder renames so paths use new folder
FILE_RENAMES = [
    ("assets/City_rotate.mp4",            "assets/city-rotate.mp4"),
    ("assets/City_rotate_poster.avif",    "assets/city-rotate-poster.avif"),
    ("assets/City_rotate_poster.jpg",     "assets/city-rotate-poster.jpg"),
    ("assets/City_rotate_poster.webp",    "assets/city-rotate-poster.webp"),
    ("assets/Get_moving.mp4",             "assets/get-moving.mp4"),
    ("assets/Get_moving_poster.avif",     "assets/get-moving-poster.avif"),
    ("assets/Get_moving_poster.jpg",      "assets/get-moving-poster.jpg"),
    ("assets/Get_moving_poster.webp",     "assets/get-moving-poster.webp"),
    ("assets/Gamehero.avif",              "assets/game-hero.avif"),
    ("assets/Gamehero.png",               "assets/game-hero.png"),
    ("assets/Gamehero.webp",              "assets/game-hero.webp"),
    ("assets/MegaX_logo2.png",            "assets/mega-x-logo2.png"),
    ("assets/MegaX_logo2_circle.png",     "assets/mega-x-logo2-circle.png"),
    ("assets/bighand_poster.avif",        "assets/bighand-poster.avif"),
    ("assets/bighand_poster.jpg",         "assets/bighand-poster.jpg"),
    ("assets/bighand_poster.webp",        "assets/bighand-poster.webp"),
    ("assets/chipfactory_poster.avif",    "assets/chipfactory-poster.avif"),
    ("assets/chipfactory_poster.jpg",     "assets/chipfactory-poster.jpg"),
    ("assets/chipfactory_poster.webp",    "assets/chipfactory-poster.webp"),
    ("assets/think_poster.avif",          "assets/think-poster.avif"),
    ("assets/think_poster.jpg",           "assets/think-poster.jpg"),
    ("assets/think_poster.webp",          "assets/think-poster.webp"),
    ("assets/wifichip_poster.avif",       "assets/wifichip-poster.avif"),
    ("assets/wifichip_poster.jpg",        "assets/wifichip-poster.jpg"),
    ("assets/wifichip_poster.webp",       "assets/wifichip-poster.webp"),
    ("assets/mega_logo_clean_vector.svg", "assets/mega-logo-clean-vector.svg"),
    ("assets/mega_x_holdings_hybrid.svg", "assets/mega-x-holdings-hybrid.svg"),
    # The PhyntomX8 children — paths use the post-folder-rename location
    ("assets/phyntom-x8/design_studio.avif", "assets/phyntom-x8/design-studio.avif"),
    ("assets/phyntom-x8/design_studio.png",  "assets/phyntom-x8/design-studio.png"),
    ("assets/phyntom-x8/design_studio.webp", "assets/phyntom-x8/design-studio.webp"),
    ("assets/phyntom-x8/game_studio.avif",   "assets/phyntom-x8/game-studio.avif"),
    ("assets/phyntom-x8/game_studio.png",    "assets/phyntom-x8/game-studio.png"),
    ("assets/phyntom-x8/game_studio.webp",   "assets/phyntom-x8/game-studio.webp"),
    ("assets/phyntom-x8/stage_design.avif",  "assets/phyntom-x8/stage-design.avif"),
    ("assets/phyntom-x8/stage_design.jpeg",  "assets/phyntom-x8/stage-design.jpeg"),
    ("assets/phyntom-x8/stage_design.webp",  "assets/phyntom-x8/stage-design.webp"),
    ("assets/phyntom-x8/hero_x8.mp4",        "assets/phyntom-x8/hero-x8.mp4"),
    ("assets/phyntom-x8/record_studio.png",  "assets/phyntom-x8/record-studio.png"),
]

# Reference patches in text content. Keys patched in HTML/CSS (and any partial / pages.json).
# Build automatically from RENAMES, but allow extra entries (e.g., folder-only refs).
# We patch BOTH the full path (preferred) and the bare basename (in case it's referenced unprefixed).
def build_patches():
    patches = []
    for old, new in FOLDER_RENAMES:
        patches.append((old + "/", new + "/"))   # most refs include trailing /
        patches.append((old + '"', new + '"'))    # plain folder ref like cwd context
    for old, new in FILE_RENAMES:
        # Replace any reference to the kebab form first (folder rename already applied)
        old_after_folder = old
        for fold_old, fold_new in FOLDER_RENAMES:
            if old_after_folder.startswith(fold_old + "/"):
                old_after_folder = fold_new + old_after_folder[len(fold_old):]
        patches.append((old_after_folder, new))  # full path
        # bare basename (only if it is reasonably unique to avoid false positives)
        old_base = old_after_folder.split("/")[-1]
        new_base = new.split("/")[-1]
        if old_base != new_base and len(old_base) >= 6:
            patches.append((old_base, new_base))
    return patches

def rename_folders():
    n = 0
    for old, new in FOLDER_RENAMES:
        old_p = ROOT / old
        new_p = ROOT / new
        if not old_p.exists():
            print(f"  folder already renamed (or missing): {old}")
            continue
        if new_p.exists():
            print(f"  WARN: target folder exists: {new}")
            continue
        shutil.move(str(old_p), str(new_p))
        print(f"  folder: {old} -> {new}")
        n += 1
    return n

def rename_files():
    n = 0
    for old, new in FILE_RENAMES:
        # If folder rename applied, old needs to be expressed in post-rename form
        for fold_old, fold_new in FOLDER_RENAMES:
            if old.startswith(fold_old + "/"):
                old = fold_new + old[len(fold_old):]
        old_p = ROOT / old
        new_p = ROOT / new
        if not old_p.exists():
            if new_p.exists():
                print(f"  file already renamed: {old} -> {new}")
            else:
                print(f"  WARN: source missing: {old}")
            continue
        if new_p.exists():
            print(f"  WARN: target exists, leaving: {new}")
            continue
        new_p.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_p), str(new_p))
        print(f"  file: {old} -> {new}")
        n += 1
    return n

def patch_text_refs():
    patches = build_patches()
    files_to_scan = (
        list(ROOT.glob("*.html")) +
        list((ROOT / "products").glob("*.html")) +
        list((ROOT / "partials").glob("*.html")) +
        list((ROOT / "partials").glob("*.json")) +
        list((ROOT / "styles").rglob("*.css"))
    )
    n = 0
    for p in files_to_scan:
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        orig = text
        for old, new in patches:
            text = text.replace(old, new)
        if text != orig:
            p.write_text(text, encoding="utf-8")
            print(f"  patched: {p.relative_to(ROOT)}")
            n += 1
    return n

def main():
    print("== folders ==")
    f = rename_folders()
    print("\n== files ==")
    fl = rename_files()
    print("\n== ref patches ==")
    p = patch_text_refs()
    print(f"\n{f} folders renamed, {fl} files renamed, {p} text files patched.")

if __name__ == "__main__":
    main()
