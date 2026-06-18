# Mega X Holding Ltd. — Corporate Website

A static marketing site for Mega X Holding Ltd. — vanilla HTML/CSS/JS, no
framework, no Node, no `npm install`. Build steps are a handful of small
Python scripts; production deploys are a `cp -r` away (see [DEPLOY.md](DEPLOY.md)).

## Pages

| URL                              | Purpose |
|----------------------------------|---------|
| `index.html`                     | Home / hero / portfolio overview |
| `about.html`                     | Company / leadership / careers |
| `contact.html`                   | Contact form + offices |
| `phyntom-x8.html`                | Product: Phyntom X8 (managed AI department) |
| `fann-gaming-ai.html`            | Product: FannX Gaming AI |
| `wifi-iot-chips.html`            | Product: ChipNexus Hub (Wi-Fi/IoT silicon) |
| `nuclear-fusion-energy.html`     | Initiative: nuclear fusion |
| `products/{freya,glink,flexv}.html` | ChipNexus deep-dive sub-pages |
| `404.html`                       | Custom error page |

## Tech stack

* HTML5 + CSS3 + Vanilla JavaScript (ES2017+)
* Google Fonts (async-loaded; see [CONTRIBUTING.md](CONTRIBUTING.md#google-fonts-loading))
* CSS custom properties (`styles/variables.css` is the design-token source)
* IntersectionObserver for scroll-revealed content + lazy video
* Mobile-first responsive (breakpoints 480 / 768 / 1024)
* Accessibility: `<a class="skip-link">`, `aria-label` on nav/dialogs,
  every `<img>` carries `alt`

## Architecture

```
mega-x/
├── README.md                 ← you are here
├── CONTRIBUTING.md           ← style + workflow rules
├── DEPLOY.md                 ← deployment recipes
│
├── *.html                    ← pages, kebab-case
├── partials/                 ← reusable HTML (nav / footer / SEO meta)
│   ├── *.html                ← templates with {{placeholders}}
│   └── pages.json            ← per-page values
│
├── styles/
│   ├── *.css                 ← split sources (variables, base, components, …)
│   ├── bundle.min.css        ← generated; loaded by every page
│   └── pages/<page>.css      ← per-page CSS (extracted from inline <style>)
│
├── js/main.js                ← single global script (defer-loaded)
├── tools/                    ← Python build / maintenance scripts
├── assets/                   ← images, video, logos (kebab-case)
└── chipnexus-content/        ← imagery for ChipNexus product pages
```

## Quick start

```bash
# Run a local server
python -m http.server 8000
# then open http://localhost:8000
```

VS Code users: an `F5` debug config (Edge → :8000) is in
`.vscode/launch.json` (local-only, not in git).

## Editing the site

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes.
**TL;DR:**

| If you want to…                       | Edit this                      | Then run                              |
|---------------------------------------|--------------------------------|---------------------------------------|
| Change nav links / footer text / SEO meta | `partials/<file>.html` + `partials/pages.json` | `python tools/inject_partials.py`  |
| Tweak a design token (color, font…)   | `styles/variables.css`         | `python tools/build_css.py`           |
| Edit per-page styling                 | `styles/pages/<page>.css`      | (just save)                           |
| Add an image                          | drop in `assets/`              | `python tools/convert_images.py && python tools/upgrade_images.py` |
| Add a video                           | drop in `assets/`              | `python tools/convert_videos.py && python tools/upgrade_videos.py` |
| Add a new page                        | new `<page>.html` + entry in `partials/pages.json` | `python tools/inject_partials.py`     |

## Naming conventions (strict)

* **All file and folder names are kebab-case** (`hero-bg.png`, not `Gamehero.png`
  or `hero_bg.png`).
* No spaces, no Unicode whitespace, no `?`/`&`/`#` in any path.
* Documented exceptions: `tools/*.py` (PEP 8 snake_case), `products/_layout.css`
  (SCSS-style underscore-prefix), `assets/phyntom-x8/cropped/a_01.png` (compact
  letter+digit IDs), `README.md` / `LICENSE` / `DEPLOY.md` (conventional
  uppercase).
* See [CONTRIBUTING.md → Naming conventions](CONTRIBUTING.md#naming-conventions)
  for the full rule + remediation script.

## Performance hygiene

This site is heavily optimized for cold-load speed:

* Google Fonts loaded via `media="print" onload` (non-blocking)
* All `<img>` wrapped in `<picture>` with AVIF + WebP + PNG/JPG fallback
  (≈ 38 MB → 3 MB on AVIF-capable browsers)
* All `<video>` use `<source type="video/webm">` before `video/mp4`
  (≈ 35 MB → 22 MB on VP9-capable browsers; some clips down 84%)
* `<script src="js/main.js" defer>` — no parser blocking; IIFE + `'use strict'`
* Hero / above-the-fold images: `loading="eager"` + `fetchpriority="high"`
* Everything else: `loading="lazy"` + `decoding="async"`
* CSS: 5 source files concat-and-minified into one `bundle.min.css`
* SVG favicon (modern browsers) with ICO/PNG fallback chain

## Build dependencies

```bash
pip install --user Pillow pillow-avif-plugin rcssmin imageio-ffmpeg
```

(That's it — no Node, no `npm`, no Webpack.)

## License

© 2026 Mega X Holding Ltd. All rights reserved.
