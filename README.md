# Mega X Holding Ltd. — Corporate Website

The Mega X Holding Ltd. marketing site **plus** the Phyntom X8 Console SPA,
served as a single Vite multi-page app. Marketing pages stay almost-vanilla
HTML/CSS/JS (one global `js/main.js`, a generated `bundle.min.css`, no
per-page bundler magic); the Console is a small React app mounted at
`/console/`. One `npm install`, one `npm run dev`, one `npm run build`.
See [DEPLOY.md](DEPLOY.md) for the AWS Amplify / static-host recipes.

## Pages

| URL                              | Purpose |
|----------------------------------|---------|
| `/`                              | Home / hero / portfolio overview |
| `/company/`                      | Company / leadership / careers |
| `/contact/`                      | Contact form + offices |
| `/phyntom-x8/`                   | Product: Phyntom X8 (managed AI department) |
| `/fann-gaming-ai/`               | Product: FannX Gaming AI |
| `/chipnexus/`                    | Product: ChipNexus Hub (Wi-Fi/IoT silicon) |
| `/nuclear-fusion-energy/`        | Initiative: nuclear fusion |
| `/chipnexus/products/{freya,glink,flexv}/` | ChipNexus deep-dive sub-pages |
| `/console/`                      | Phyntom X8 Console (React SPA) |
| `/zh/...`                        | Chinese mirror of every page above |
| `/404.html`                      | Custom error page |

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
├── index.html                ← homepage (stays at root)
├── 404.html                  ← error page (stays at root)
│
├── company/index.html        ← /company/   (was about.html)
├── contact/index.html        ← /contact/
├── phyntom-x8/index.html     ← /phyntom-x8/
├── fann-gaming-ai/index.html ← /fann-gaming-ai/
├── chipnexus/                ← /chipnexus/  (was wifi-iot-chips.html)
│   ├── index.html
│   └── products/
│       ├── freya/index.html
│       ├── glink/index.html
│       └── flexv/index.html
├── nuclear-fusion-energy/index.html
│
├── partials/                 ← reusable HTML fragments
│   ├── *.html                ← templates with {{placeholders}} and {{t:KEY}} i18n tokens
│   └── pages.json            ← per-page values (consumed by tools/vite-plugin-partials.ts)
│
├── styles/
│   ├── *.css                 ← split sources for marketing static site
│   ├── bundle.min.css        ← generated for marketing; loaded by every marketing page
│   └── pages/<page>.css      ← per-page CSS
│
├── public/                   ← Vite verbatim-copy directory (no hashing, no tracking)
│   ├── js/main.js            ← single global script (vanilla, defer)
│   └── assets/               ← ALL static assets — images, video, logos, chipnexus-content, team, etc.
│       ├── chipnexus-content/  ← imagery for ChipNexus product pages (PPT-derived)
│       ├── phyntom-x8/         ← Phyntom X8 product imagery + cropped/ scatter PNGs
│       ├── team/               ← team photos
│       └── *.{png,webp,avif,mp4,webm,ico,svg}  ← top-level shared assets
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
- `/company/`, `/phyntom-x8/`, `/chipnexus/`, … → per-page directories, each with its own `index.html` (clean extensionless URLs)
- `/zh/<page>/` → Chinese mirror, emitted by the partials plugin's `closeBundle` hook
- `/console/` → `console/index.html` (React SPA shell)
- `/console/business/dashboard` and other client-side routes → static SPA shells emitted by `vite-plugin-console-spa-paths` (so deep refresh works without a server rewrite). React Router with `basename="/console"` matches the rest.

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
| Add a new marketing page | new `<slug>/index.html` directory + entry in `partials/pages.json` + add to `build.rollupOptions.input` in `vite.config.ts` | save; wrap with `<!-- partial:NAME -->` markers so the Vite plugin can fill them in |
| Edit Console SPA | `console/src/**` | HMR |

## Naming conventions (strict)

* **All file and folder names are kebab-case** (`hero-bg.png`, not `Gamehero.png`
  or `hero_bg.png`).
* No spaces, no Unicode whitespace, no `?`/`&`/`#` in any path.
* Documented exceptions: `tools/*.py` (PEP 8 snake_case),
  `public/assets/phyntom-x8/cropped/a_01.png` (compact letter+digit IDs),
  `README.md` / `LICENSE` / `DEPLOY.md` / `CONTRIBUTING.md` (conventional
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
npm install                                                    # Vite + plugins + React
pip install --user Pillow pillow-avif-plugin imageio-ffmpeg    # asset pipeline (images / video)
```

The Python deps are only used by the helper scripts under [tools/](tools/)
(`convert_images.py`, `convert_videos.py`, etc.). The site itself builds with
Vite — no webpack.

## License

© 2026 Mega X Holding Ltd. All rights reserved.

### Company research workspace

The committed Native research workbench now lives in the Console at
`/console/#/business/c/<company-id>/research`. Select **Research / 投研** in a
company's sidebar. Use the existing company switcher and create-company flow.
The page includes A-share/US research, execution history, report preview and
download, the complete investor catalog, profile conversations and roundtables.
It follows the Console's language selector (Chinese/English; English fallback
inside the research region when Arabic is selected).

```bash
pnpm install --frozen-lockfile
VITE_USE_MOCK=false VITE_API_TARGET=http://127.0.0.1:8002 pnpm dev
```

`VITE_API_TARGET` controls the development reverse proxy. `VITE_API_BASE` controls
the browser API origin in split-host deployments; previews and downloads use that
origin. Production remains the existing Vite build and existing backend `/v1`
interfaces. The new page does not request backend `/workbench/` assets.

Research pure-module tests require Node 24+ (native TypeScript support); the
production bundle retains the existing Node 18.18+ build floor:

```bash
node --test console/tests/research*.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

Browser regression intercepts every `/v1` request, including all writes. Provide
an installed Playwright runtime (absolute path to its `index.mjs`) or install
Playwright in your local test environment, then run against a running dev server:

```bash
RESEARCH_PREVIEW_URL=http://127.0.0.1:5174 PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs node console/tests/research-browser.mjs
```

No deployment or remote Git push is part of this migration.
