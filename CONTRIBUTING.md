# Contributing

This file documents the conventions and tooling used by the Mega X Holding website.
**Read this before adding a new page, image, partial, or tool.** All build steps are
plain Python — no Node, no `npm install` for the website itself.

## Repository layout

```
mega-x/
├── README.md                  ← project overview
├── CONTRIBUTING.md            ← this file
├── DEPLOY.md                  ← deployment recipes (Netlify / Vercel / GitHub Pages…)
├── *.html                     ← top-level pages (kebab-case)
├── products/*.html            ← product detail pages
│
├── partials/                  ← reusable HTML fragments
│   ├── nav.html
│   ├── mobile-menu.html
│   ├── footer.html
│   ├── seo.html
│   └── pages.json             ← per-page config that drives partial injection
│
├── styles/                    ← CSS (see styles/README.md)
│   ├── variables.css          ← tokens
│   ├── base.css               ← element resets
│   ├── components.css         ← buttons, cards, nav, footer …
│   ├── animations.css         ← keyframes
│   ├── utilities.css          ← atomic helpers
│   ├── bundle.min.css         ← generated; do NOT edit
│   └── pages/<page>.css       ← per-page CSS (extracted from inline <style>)
│
├── js/main.js                 ← single global script (loader, nav, scroll, lazy video)
├── chipnexus-content/         ← imagery for ChipNexus products (PPT-derived)
├── assets/                    ← images, video, logos
│   ├── phyntom-x8/            ← per-product imagery
│   ├── team/
│   ├── fann/
│   ├── image-set/
│   └── …
├── tools/                     ← build / maintenance scripts (Vite plugins + Python image/video pipeline)
└── console/                   ← Phyntom X8 Console React SPA (src + index.html only; build
                                 config lives at mega-x root since the Vite migration)
```

> **Build model (post-Vite migration, 2026-06-23)**:
>
> - The whole site is one Vite project — `npm install` + `npm run dev` at this directory's root.
> - Marketing pages stay vanilla HTML/CSS/JS; Vite serves and HMR-reloads them.
> - The Console SPA at `console/index.html` + `console/src/` is the only React+Tailwind+TS subtree.
> - The Python image/video tools under `tools/` (`convert_images.py`, `convert_videos.py`, etc.) are still used — Vite does HTML/CSS/JS bundling but not Pillow/ffmpeg work.
> - `tools/inject_partials.py` is **legacy** (kept for one-off wrapping of new page files). At dev/build time the partial injection happens via [`tools/vite-plugin-partials.ts`](tools/vite-plugin-partials.ts) which mirrors the Python rendering rules.

## Naming conventions

This is a **strict** project — keep it consistent or future grep / refactors break.

### Files and folders → **kebab-case** (lowercase, hyphen separator)

```
✅ assets/phyntom-x8/hero-x8.mp4
✅ styles/pages/wifi-iot-chips.css
✅ partials/mobile-menu.html

❌ assets/PhyntomX8/hero_x8.mp4         (PascalCase folder, snake_case file)
❌ styles/pages/wifi_iot_chips.css      (snake_case)
❌ partials/MobileMenu.html             (PascalCase)
```

### Exceptions (intentional)

| Path                               | Convention      | Why |
|------------------------------------|-----------------|------|
| `tools/*.py`                       | snake_case      | PEP 8 — Python module names |
| `products/_layout.css`             | leading `_`     | SCSS-style "partial / not a public entry" hint |
| `assets/phyntom-x8/cropped/a_01.png` | `<letter>_<digit>` | Compact sequence ID; treated as one token |
| `README.md`, `LICENSE`, `DEPLOY.md` | UPPERCASE       | Conventional repo metadata |

### Anything user-facing (URL-visible)

URLs must work without percent-encoding. **No spaces, no `?`, `&`, `#`, no Unicode
control chars in paths.** If you spot one, run [`tools/rename_to_kebab_case.py`][rk] or add it to that script's `FILE_RENAMES` table.

[rk]: tools/rename_to_kebab_case.py

## HTML conventions

### Pages are driven by partials + per-page config

Every page that has `<nav>`, `<footer>`, or share-card metadata uses
**marker-bracketed partials**:

```html
<!-- partial:nav -->
<!-- AUTO-GENERATED FROM partials/nav.html — DO NOT EDIT BETWEEN partial:nav MARKERS -->
… rendered nav …
<!-- /partial:nav -->
```

You **do not edit** the rendered region in HTML. Instead:
1. Edit `partials/<name>.html` (template, with `{{placeholder}}` syntax).
2. Edit `partials/pages.json` to set per-page values (active link, tagline, SEO meta…).
3. Run `python tools/inject_partials.py` to re-render every affected page.

Available partial slots: `nav`, `mobile-menu`, `footer`, `seo`.

### Inline `<style>` is forbidden in `<head>`

Page-specific CSS lives in [`styles/pages/<page>.css`](styles/pages/) and is referenced
by `<link rel="stylesheet" href="styles/pages/<page>.css">` after the bundle.

If you ever paste a `<style>` block inline, run [`tools/extract_inline_styles.py`][ex]
to relocate it.

[ex]: tools/extract_inline_styles.py

### Section-scoped `<style>` inside `<body>` is OK

Example: `wifi-iot-chips.html` keeps a small `<style>` inside its `<section
id="portfolio">` because the rules are local. Don't try to lift those out.

### Google Fonts loading

All pages use the **non-blocking** triplet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/…">
<link rel="stylesheet" href="https://fonts.googleapis.com/…" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/…"></noscript>
```

If you add a new page with a different font set, run
[`tools/unify_font_loading.py`][uf] to normalize the loading pattern.

[uf]: tools/unify_font_loading.py

### Images

Use `<picture>` with AVIF + WebP + the original PNG/JPG fallback:

```html
<picture>
  <source type="image/avif" srcset="assets/foo.avif">
  <source type="image/webp" srcset="assets/foo.webp">
  <img src="assets/foo.png" alt="…" decoding="async" loading="lazy">
</picture>
```

Shortcut: write a plain `<img src="assets/foo.png" alt="…">`, then run
[`tools/convert_images.py`][ci] (creates `.avif` / `.webp` siblings) and
[`tools/upgrade_images.py`][ui] (wraps it in `<picture>` and adds the right
loading hints).

Above-the-fold images (hero / nav logo) get `loading="eager"` +
`fetchpriority="high"` automatically by the upgrade script — see its
`EAGER_IMAGES` set if you need to mark a new one.

[ci]: tools/convert_images.py
[ui]: tools/upgrade_images.py

### Scripts

`<script src="js/main.js" defer></script>` — always `defer`. The script
references DOM at top level (e.g., `document.querySelector('.nav')`),
which only works under `defer`'s "execute after DOM parsed" semantics.

## CSS conventions

* Source of truth: [`styles/variables.css`][v], [`base.css`][b], [`components.css`][c],
  [`animations.css`][a], [`utilities.css`][u].
* Generated artifact: [`styles/bundle.min.css`][m] — produced by
  `python tools/build_css.py` (rcssmin).
* Per-page CSS lives in `styles/pages/<page>.css` (kebab-case, matches the HTML
  filename).
* See [`styles/README.md`](styles/README.md) for the source-vs-bundle rule.

[v]: styles/variables.css
[b]: styles/base.css
[c]: styles/components.css
[a]: styles/animations.css
[u]: styles/utilities.css
[m]: styles/bundle.min.css

## JavaScript conventions

[`js/main.js`](js/main.js) is intentionally a single global script:

* Vanilla DOM, no framework.
* `defer`-loaded — top-level DOM queries are safe.
* Wrapped in an IIFE with `'use strict'` at the top — top-level `const`/`let`
  do **not** leak to `window`. Don't undo that.
* Wrap any new feature in a `if (root) { … }` null-guard. We don't ship
  per-page bundles, so a missing element on one page must not crash the rest.
* If you add a third-party `<script>`, defer it too and put it in **page-level
  HTML**, not in `main.js`.

## Adding a new page

1. Copy an existing page (`about.html` is a good template).
2. Rename it to `your-new-page.html` (kebab-case).
3. Add an entry to [`partials/pages.json`](partials/pages.json):
   ```json
   "your-new-page.html": {
     "active": "your-new-page",
     "renderFooter": true,
     "title": "Your New Page — Mega X Holding Ltd.",
     "description": "…",
     "ogTitle": "…",
     "ogDescription": "…",
     "canonical": "/your-new-page.html"
   }
   ```
4. Run the build chain (see "Building" below).
5. Smoke-test: `python -m http.server 8000`, hit the URL.

## Adding a new image

```bash
# 1. Drop the source file into assets/  (kebab-case filename)
cp ~/Pictures/our-new-thing.png assets/our-new-thing.png

# 2. Reference it in HTML
#    <img src="assets/our-new-thing.png" alt="…">

# 3. Generate AVIF + WebP siblings, then wrap with <picture>
python tools/convert_images.py
python tools/upgrade_images.py
```

## Adding a new video

```bash
# 1. Drop the source MP4 into assets/  (kebab-case filename, no audio for
#    decorative loops)
cp ~/Movies/our-new-loop.mp4 assets/our-new-loop.mp4

# 2. Reference it in HTML — copy the existing pattern from index.html:
#      <video class="lazy-video" loop muted playsinline preload="none"
#             poster="assets/our-new-loop-poster.jpg">
#        <source data-src="assets/our-new-loop.mp4" type="video/mp4">
#      </video>

# 3. Encode WebM (VP9, no audio) sibling and inject the <source> tag
python tools/convert_videos.py
python tools/upgrade_videos.py
```

`convert_videos.py` skips files where the WebM came out larger than the MP4
(rare, but happens for already-aggressive sources). For those, leave the
single `<source type="video/mp4">` in place.

## Favicon

Each page links three icons:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">     ← modern browsers
<link rel="icon" href="assets/final-favicon.ico" type="image/x-icon">
<link rel="icon" href="assets/final-favicon.png" type="image/png">
<link rel="apple-touch-icon" href="assets/final-apple-touch-icon.png">
```

`favicon.svg` lives at site root (so the URL stays `/favicon.svg`). If you
ever need to add the SVG link to a fresh page, run
[`tools/add_svg_favicon.py`][af] — it inserts the line above any existing
`final-favicon.ico` reference, idempotently.

[af]: tools/add_svg_favicon.py

## Building

The site has **no continuous build watcher**. Run scripts before committing,
in this order:

```bash
python tools/extract_inline_styles.py   # if you accidentally inlined <style>
python tools/unify_font_loading.py      # if you added Google Fonts a different way
python tools/add_svg_favicon.py         # if you created a new HTML page from scratch
python tools/inject_partials.py         # always — sync partials → pages
python tools/convert_images.py          # if you added new PNG/JPG
python tools/upgrade_images.py          # always — wrap any new <img>
python tools/convert_videos.py          # if you added new MP4
python tools/upgrade_videos.py          # always — inject WebM <source> when sibling exists
python tools/build_css.py               # if you edited any styles/*.css source
```

Every script is **idempotent** — safe to re-run. They print `unchanged: …`
when they have nothing to do.

To run them all in one shot:

```bash
for s in extract_inline_styles unify_font_loading add_svg_favicon \
         inject_partials \
         convert_images upgrade_images \
         convert_videos upgrade_videos \
         build_css; do
    python tools/$s.py
done
```

## Tools cheat sheet

| Script                                    | Purpose                                                        | When to run |
|-------------------------------------------|----------------------------------------------------------------|-------------|
| [`build_css.py`][t1]                      | Concat split CSS sources → minify → `bundle.min.css`           | After editing any source CSS |
| [`extract_inline_styles.py`][t2]          | Move inline `<head>` `<style>` to `styles/pages/<page>.css`    | If you inadvertently inlined style |
| [`unify_font_loading.py`][t3]             | Convert blocking Google Fonts `<link>` → async pattern         | If you added a new Google Fonts URL |
| [`inject_partials.py`][t4]                | Render partials into pages from `partials/pages.json`          | After editing a partial or page config |
| [`convert_images.py`][t5]                 | Generate AVIF + WebP siblings for every referenced PNG/JPG     | After adding any image |
| [`upgrade_images.py`][t6]                 | Wrap `<img>` in `<picture>` + add `decoding/loading/fetchpriority` | After adding any image |
| [`convert_videos.py`][t7]                 | Encode referenced MP4 → WebM (VP9, no audio) using imageio-ffmpeg | After adding any video |
| [`upgrade_videos.py`][t8]                 | Inject `<source type="video/webm">` before each MP4 source    | After adding any video |
| [`add_svg_favicon.py`][t9]                | Add SVG favicon `<link>` to every page that has the ICO link   | When creating a new page from scratch |
| [`rename_to_kebab_case.py`][t10]          | One-shot folder/file rename to kebab-case + ref patches        | Won't be needed again unless you intentionally introduce new bad names |
| `rename_spaced_files.py`                  | Historical (kept for archeology) — superseded by the above     | Never |

[t1]: tools/build_css.py
[t2]: tools/extract_inline_styles.py
[t3]: tools/unify_font_loading.py
[t4]: tools/inject_partials.py
[t5]: tools/convert_images.py
[t6]: tools/upgrade_images.py
[t7]: tools/convert_videos.py
[t8]: tools/upgrade_videos.py
[t9]: tools/add_svg_favicon.py
[t10]: tools/rename_to_kebab_case.py

## Debugging in VS Code (Edge)

The recommended flow is **attach**, not launch. Edge's single-instance /
compat-layer behaviour swallows the launch-time `--remote-debugging-port`
flag too often to be reliable.

1. Double-click [`tools/debug-edge.bat`][tdbg] — opens a side window that:
   - spawns `tools/dev_server.py` on port 8000
   - launches Edge with `--remote-debugging-port=9223` and an isolated
     `--user-data-dir=.vscode/.edge-profile`
   - Edge navigates to `http://localhost:8000/`
2. In VS Code, Run & Debug → select **`mega-x (attach Edge :9223)`** → F5.

Stop debugging in VS Code → only detaches; Edge and the dev_server keep
running. To fully shut down, close the bat's terminal window (kills
Edge) and the minimized dev_server cmd window.

The `(launch)` configs in `.vscode/launch.json` are kept for
documentation but should be considered fallback only — see git log of
this file for the diagnostic notes.

[tdbg]: tools/debug-edge.bat

## Pre-commit checklist

- [ ] `python tools/inject_partials.py` reports `0 files updated`
- [ ] `python tools/upgrade_images.py` reports `0 files updated`
- [ ] `python tools/upgrade_videos.py` reports `0 files updated`
- [ ] `python tools/build_css.py` writes the same `bundle.min.css`
- [ ] No new file/folder name has uppercase letters, spaces, or `_`
      (other than the documented exceptions)
- [ ] No new inline `<style>` block in `<head>`
- [ ] Each page has exactly one `<h1>`
- [ ] `git status` is clean except for files you actually intend to change
- [ ] Local smoke test passed: `python -m http.server 8000` then visit each touched page

## Python tooling

The scripts in `tools/` use only:

* Standard library
* [`Pillow`](https://pypi.org/project/Pillow/) + [`pillow-avif-plugin`](https://pypi.org/project/pillow-avif-plugin/) — for AVIF/WebP encoding
* [`rcssmin`](https://pypi.org/project/rcssmin/) — for CSS minification
* [`imageio-ffmpeg`](https://pypi.org/project/imageio-ffmpeg/) — bundled FFmpeg binary for VP9 encoding (no system install required)

Install with:

```bash
pip install --user Pillow pillow-avif-plugin rcssmin imageio-ffmpeg
```
