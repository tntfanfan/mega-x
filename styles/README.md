# styles/

## Source of truth (edit these)

- `variables.css` — CSS custom properties (colors, fonts, spacing, z-index)
- `base.css` — element resets + base styles
- `components.css` — buttons, cards, nav, footer, modals, etc.
- `animations.css` — keyframes, scroll reveal, hover transitions
- `utilities.css` — small atomic helpers (margins, layout)
- `pages/<page>.css` — per-page CSS (extracted from inline `<style>` blocks)

## Generated (do NOT edit by hand)

- `bundle.min.css` — minified concat of the 5 split sources, in order:
  variables → base → components → animations → utilities

## Rebuild

```bash
python tools/build_css.py
```

The bundle is the only file referenced by HTML pages. Page-level CSS
(`pages/*.css`) is loaded separately after the bundle.
