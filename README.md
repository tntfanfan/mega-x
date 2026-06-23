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

## Architecture (Vite MPA)

The whole site — marketing static pages **and** the Phyntom X8 Console SPA — is now a single Vite project at this directory's root. One `npm install`, one `npm run dev`, one `npm run build`.

```
mega-x/
├── README.md                 ← you are here
├── CONTRIBUTING.md           ← style + workflow rules
├── DEPLOY.md                 ← deployment recipes
│
├── package.json              ← Vite + plugins + React (for console SPA)
├── vite.config.ts            ← MPA entries + custom partials plugin + console SPA fallback
├── tsconfig.json             ← TypeScript (mostly for console/src/*.tsx)
├── tailwind.config.ts        ← scoped to console/ subtree (marketing CSS untouched)
├── postcss.config.js
├── .env.development          ← VITE_USE_MOCK=true (console mock mode default)
│
├── *.html                    ← marketing pages, kebab-case (each is a Vite MPA entry)
├── partials/                 ← reusable HTML fragments
│   ├── *.html                ← templates with {{placeholders}}
│   └── pages.json            ← per-page values (now consumed by tools/vite-plugin-partials.ts)
│
├── styles/
│   ├── *.css                 ← split sources for marketing static site
│   ├── bundle.min.css        ← generated for marketing; loaded by every marketing page
│   └── pages/<page>.css      ← per-page CSS
│
├── js/main.js                ← single global script (still vanilla; Vite serves as-is)
├── assets/                   ← images, video, logos (kebab-case)
├── chipnexus-content/        ← imagery for ChipNexus product pages
│
├── tools/
│   ├── vite-plugin-partials.ts          ← TS port of inject_partials.py (dev + build)
│   ├── vite-plugin-console-fallback.ts  ← /console/* SPA fallback middleware
│   ├── inject_partials.py               ← legacy; kept for one-off wrapping of new pages
│   ├── build_css.py                     ← legacy; Vite now bundles CSS automatically
│   ├── convert_images.py / upgrade_images.py  ← active (Pillow + AVIF pipeline)
│   └── convert_videos.py / upgrade_videos.py  ← active (ffmpeg pipeline)
│
└── console/                  ← Phyntom X8 Console React SPA
    ├── index.html            ← SPA shell — one of the Vite MPA entries
    └── src/                  ← React components, pages, lib (api/mocks/auth/utils)
```

**Routing model:**
- `/` → `index.html` (marketing home)
- `/about.html`, `/phyntom-x8.html`, … → respective marketing pages
- `/console/` → `console/index.html` (React SPA shell)
- `/console/business/dashboard` and other client-side routes → also `console/index.html` (handled by the `consoleSpaFallback` plugin in dev, by nginx `try_files` in prod). React Router with `basename="/console"` matches the rest.

## Quick start

```bash
npm install      # first time (installs Vite + React + Tailwind + plugins)
npm run dev      # http://localhost:5173
```

- `http://localhost:5173/` — marketing home
- `http://localhost:5173/console/` — Console SPA (selector landing)
- `http://localhost:5173/console/business/dashboard` — Console pages (mock data by default; see [.env.development](.env.development))

Edit any `*.html` / `partials/*.html` / `partials/pages.json` / `console/src/**` — HMR refreshes the browser instantly. No more `python tools/inject_partials.py` chore; the Vite plugin does it on each request.

### VS Code F5 debug

[.vscode/launch.json](.vscode/launch.json) was set up to attach Edge on port 9223 to a Python static server. After the Vite migration, easiest path is to:

1. Run `npm run dev` in a terminal
2. Open `http://localhost:5173/` in Edge with `--remote-debugging-port=9223 --user-data-dir=...`
3. Select **`mega-x (attach Edge :9223)`** in VS Code's Run & Debug and press F5

(The old `tools/debug-edge.bat` still starts Python `dev_server.py` — for the Vite era we'll update it next. Until then, manual sequence above works.)

## Editing the site

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. **TL;DR (Vite era):**

| If you want to… | Edit this | Then |
|---|---|---|
| Change nav / footer / SEO across pages | `partials/<file>.html` + `partials/pages.json` | save → HMR re-injects automatically |
| Tweak a design token (color, font…) | `styles/variables.css` **and** `tailwind.config.ts` (mirror) | save (`bundle.min.css` is committed; only edit it if you want — Vite will rebuild on next `npm run build`) |
| Edit per-page styling | `styles/pages/<page>.css` | save |
| Add an image | drop in `assets/` | `npm run convert:images` (alias for `python tools/convert_images.py`) |
| Add a video | drop in `assets/` | `npm run convert:videos` |
| Add a new marketing page | new `<page>.html` + entry in `partials/pages.json` + add to `build.rollupOptions.input` in `vite.config.ts` | save; first run also needs `npm run inject:partials-legacy` to wrap the new page with `<!-- partial:NAME -->` markers (Vite plugin only handles "replace between markers") |
| Edit Console SPA | `console/src/**` | HMR |

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
