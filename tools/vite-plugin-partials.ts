/**
 * Vite plugin — partial injection + locale emission for mega-x marketing pages.
 *
 * Two responsibilities:
 *
 * 1. Partial substitution (transformIndexHtml, runs during Vite build):
 *    Reads partials/pages.json + partials/*.html, replaces the content
 *    between `<!-- partial:NAME -->` markers in each entry HTML. Visible
 *    text inside the rendered partials is emitted as `{{t:KEY}}` tokens —
 *    intentionally left for step 2 to substitute per-locale.
 *
 * 2. Locale emission (closeBundle, runs after Vite writes dist):
 *    Reads i18n/en.json + i18n/zh.json. For each HTML in dist/, substitutes
 *    `{{t:KEY}}` tokens with the locale's translation. English overwrites
 *    the original file path; Chinese is written under dist/zh/. Also injects
 *    `<link rel="alternate" hreflang="...">` tags and swaps `<html lang>`.
 *
 * To add Arabic later: drop `ar.json` into i18n/ with the same keys mirrored,
 * add "ar" to ENABLED_LOCALES below. Optionally toggle `dir="rtl"` injection.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export interface MegaxPartialsOptions {
  /** mega-x root directory (where partials/ and i18n/ live). */
  root: string;
}

interface PagesConfig {
  _default?: Record<string, unknown>;
  [page: string]: unknown;
}

interface PageCfg {
  active?: string | null;
  navExtraClass?: string;
  homeInNav?: boolean;
  homeInMobile?: boolean;
  renderNav?: boolean;
  renderFooter?: boolean;
  tagline?: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  canonical?: string;
  noindex?: boolean;
}

interface Defaults {
  tagline?: string;
  siteUrl?: string;
  ogImage?: string;
  twitterCard?: string;
}

type Translations = Record<string, string>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Locales the build currently ships. Add "ar" here once i18n/ar.json is filled.
const ENABLED_LOCALES = ["en", "zh"] as const;
const DEFAULT_LOCALE = "en";

/**
 * Map a pages.json key like "about.html" or "products/freya.html" to the
 * SEO i18n page-id segment: "about", "products.freya", etc. Used to build
 * `seo.<page-id>.title` token keys.
 */
function pageIdFromRel(rel: string): string {
  // index.html → "home" (more natural i18n key than "index")
  if (rel === "index.html") return "home";
  return rel
    .replace(/\.html$/, "")
    .replace(/[\\/]/g, ".");
}

export function megaxPartials(opts: MegaxPartialsOptions): Plugin {
  const root = opts.root;
  const partialsDir = path.join(root, "partials");
  const pagesJsonPath = path.join(partialsDir, "pages.json");
  const i18nDir = path.join(root, "i18n");

  const loadPages = (): PagesConfig =>
    JSON.parse(readFileSync(pagesJsonPath, "utf-8"));

  const loadPartial = (name: string): string =>
    readFileSync(path.join(partialsDir, `${name}.html`), "utf-8").replace(/\n+$/, "");

  const loadTranslations = (locale: string): Translations => {
    const filePath = path.join(i18nDir, `${locale}.json`);
    try {
      const json = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const out: Translations = {};
      for (const [k, v] of Object.entries(json)) {
        if (k.startsWith("_")) continue; // skip _comment etc.
        if (typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  };

  /** Mirrors Python `active_attr`: returns the inline style attr for the active page. */
  const activeAttr = (item: string, active: unknown): string =>
    active && item === active ? ' style="color:var(--color-primary);"' : "";

  // ── Partial renderers (transformIndexHtml phase) ────────────────────────
  // These embed `{{t:KEY}}` tokens for visible text. Tokens get resolved per
  // locale in closeBundle.

  const renderNav = (cfg: PageCfg): string => {
    let tpl = loadPartial("nav");
    const navExtra = cfg.navExtraClass ? ` ${cfg.navExtraClass}` : "";
    tpl = tpl.replace("{{nav-extra-class}}", navExtra);
    if (cfg.homeInNav !== false) {
      tpl = tpl.replace(
        "{{home-li}}",
        `<li><a href="index.html"${activeAttr("home", cfg.active)}>{{t:nav.home}}</a></li>`,
      );
    } else {
      tpl = tpl.replace(/\n[ \t]*\{\{home-li\}\}/, "");
    }
    tpl = tpl.replace(/\{\{active:([a-z0-9-]+)\}\}/g, (_, key) =>
      activeAttr(key, cfg.active),
    );
    return tpl;
  };

  const renderMobile = (cfg: PageCfg): string => {
    let tpl = loadPartial("mobile-menu");
    if (cfg.homeInMobile !== false) {
      tpl = tpl.replace("{{home-link}}", '<a href="index.html">{{t:nav.home}}</a>');
    } else {
      tpl = tpl.replace(/\n[ \t]*\{\{home-link\}\}/, "");
    }
    return tpl;
  };

  const renderFooter = (cfg: PageCfg): string => {
    // `cfg.tagline` field (if set per page) overrides the default — but for
    // i18n purposes, we let the tagline come from a per-page token, not from
    // pages.json. So we just emit the partial verbatim; the partial uses
    // `{{t:footer.tagline.<page-id>}}` tokens internally.
    void cfg;
    return loadPartial("footer");
  };

  /**
   * SEO partial — renders with structural fields (canonical/og:image URLs) and
   * generic `{{t:seo.title}}` tokens which we rewrite to page-scoped tokens
   * like `{{t:seo.about.title}}` so closeBundle can resolve them per locale.
   */
  const renderSeo = (rel: string, cfg: PageCfg, defaults: Defaults): string => {
    const tpl = loadPartial("seo");
    const siteUrl = (defaults.siteUrl ?? "").replace(/\/$/, "");
    const canonicalPath = cfg.canonical ?? `/${rel.replace(/\\/g, "/")}`;
    const canonicalUrl = siteUrl + canonicalPath;
    const ogImagePath = cfg.ogImage ?? defaults.ogImage ?? "";
    const ogImageUrl = ogImagePath
      ? siteUrl + "/" + ogImagePath.replace(/^\//, "")
      : "";
    const twitterCard = cfg.twitterCard ?? defaults.twitterCard ?? "summary_large_image";
    const robots = cfg.noindex ? '<meta name="robots" content="noindex">' : "";

    // Rewrite generic SEO tokens to page-scoped ones the i18n step understands.
    const pageId = pageIdFromRel(rel);
    return tpl
      .replace(/\{\{title\}\}/g, `{{t:seo.${pageId}.title}}`)
      .replace(/\{\{description\}\}/g, `{{t:seo.${pageId}.description}}`)
      .replace(/\{\{ogTitle\}\}/g, `{{t:seo.${pageId}.og-title}}`)
      .replace(/\{\{ogDescription\}\}/g, `{{t:seo.${pageId}.og-description}}`)
      .replace(/\{\{canonicalUrl\}\}/g, canonicalUrl)
      .replace(/\{\{ogImageUrl\}\}/g, ogImageUrl)
      .replace(/\{\{twitterCard\}\}/g, twitterCard)
      .replace(/\{\{robots\}\}/g, robots);
  };

  // NB: marker regex tolerates both CRLF (Windows) and LF.
  const replaceBetweenMarkers = (text: string, name: string, body: string): string => {
    const open = `<!-- partial:${name} -->`;
    const close = `<!-- /partial:${name} -->`;
    const re = new RegExp(
      `([ \\t]*)${escapeRe(open)}\\r?\\n[\\s\\S]*?\\r?\\n[ \\t]*${escapeRe(close)}`,
      "g",
    );
    return text.replace(re, (_m, lead) => `${lead}${open}\n${body}\n${lead}${close}`);
  };

  const removeMarker = (text: string, name: string): string => {
    const open = `<!-- partial:${name} -->`;
    const close = `<!-- /partial:${name} -->`;
    const re = new RegExp(
      `[ \\t]*${escapeRe(open)}\\r?\\n[\\s\\S]*?\\r?\\n[ \\t]*${escapeRe(close)}\\r?\\n?`,
      "g",
    );
    return text.replace(re, "");
  };

  const renderPage = (html: string, rel: string): string => {
    const pages = loadPages();
    const defaults = (pages._default ?? {}) as Defaults;
    const cfg = pages[rel] as PageCfg | undefined;
    if (!cfg) return html; // page not configured (e.g. console/index.html) — skip
    let out = html;
    if (cfg.renderNav !== false) {
      out = replaceBetweenMarkers(out, "nav", renderNav(cfg));
      out = replaceBetweenMarkers(out, "mobile-menu", renderMobile(cfg));
    } else {
      out = removeMarker(out, "nav");
      out = removeMarker(out, "mobile-menu");
    }
    if (cfg.renderFooter !== false) {
      out = replaceBetweenMarkers(out, "footer", renderFooter(cfg));
    } else {
      out = removeMarker(out, "footer");
    }
    if (cfg.title) {
      out = replaceBetweenMarkers(out, "seo", renderSeo(rel, cfg, defaults));
    }
    return out;
  };

  // ── Locale emission (closeBundle phase) ─────────────────────────────────

  const TOKEN_RE = /\{\{t:([^}]+)\}\}/g;

  /** Substitute every `{{t:KEY}}` with the locale's translation; missing keys
   *  fall back to the default locale's translation, then to the key itself. */
  function substituteTokens(
    html: string,
    locale: string,
    primary: Translations,
    fallback: Translations,
  ): string {
    return html.replace(TOKEN_RE, (_, key) => {
      const val = primary[key] ?? fallback[key];
      if (val == null) {
        // Surface missing keys as a comment-like marker; visible but easy to grep
        return `«MISSING:${locale}:${key}»`;
      }
      return val;
    });
  }

  /** Inject hreflang alternate links right before </head>. */
  function injectHreflang(html: string, baseUrl: string, relPath: string): string {
    // relPath has no leading slash; in URL form: `${baseUrl}/<relPath>` for en,
    // `${baseUrl}/<locale>/<relPath>` for others. index.html collapses to "/".
    const enPath = relPath === "index.html" ? "/" : "/" + relPath;
    const tags = [
      `<link rel="alternate" hreflang="en" href="${baseUrl}${enPath}">`,
      `<link rel="alternate" hreflang="zh" href="${baseUrl}/zh${enPath}">`,
      `<link rel="alternate" hreflang="x-default" href="${baseUrl}${enPath}">`,
    ];
    return html.replace(/<\/head>/i, tags.join("\n  ") + "\n  </head>");
  }

  /** Set the <html lang="..."> attribute. */
  function setHtmlLang(html: string, locale: string): string {
    return html.replace(/<html(\s[^>]*?)?\s*lang="[^"]*"/i, (m) =>
      m.replace(/lang="[^"]*"/, `lang="${locale}"`),
    );
  }

  /** Recursively list .html files under dir (relative to dir). */
  function walkHtml(dir: string, base = dir, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        // Skip already-emitted locale subdirs (zh/, ar/, etc.) to avoid double processing.
        if ((ENABLED_LOCALES as readonly string[]).includes(entry)) continue;
        walkHtml(full, base, acc);
      } else if (entry.endsWith(".html")) {
        acc.push(path.relative(base, full).replace(/\\/g, "/"));
      }
    }
    return acc;
  }

  return {
    name: "mega-x-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Dev:   ctx.path = "/index.html", "/products/freya.html", etc.
        // Build: ctx.path is undefined; ctx.filename is the absolute disk path.
        let rel = "";
        if (ctx.path) {
          rel = ctx.path.replace(/^\//, "");
        } else if (ctx.filename) {
          rel = path.relative(root, ctx.filename).replace(/\\/g, "/");
        }
        let out = renderPage(html, rel);

        // Dev-only: also do a single-locale token substitution so the dev
        // server preview renders human text instead of raw `{{t:KEY}}`.
        // Build skips this — closeBundle does multi-locale emission.
        if (ctx.server) {
          const en = loadTranslations(DEFAULT_LOCALE);
          out = substituteTokens(out, DEFAULT_LOCALE, en, en);
          out = setHtmlLang(out, DEFAULT_LOCALE);
        }
        return out;
      },
    },
    closeBundle() {
      const distDir = path.resolve(root, "dist");
      try { statSync(distDir); } catch { return; } // no dist yet

      const pages = loadPages();
      const defaults = (pages._default ?? {}) as Defaults;
      const siteUrl = (defaults.siteUrl ?? "").replace(/\/$/, "");

      const enTrans = loadTranslations("en");
      const localeTrans: Record<string, Translations> = { en: enTrans };
      for (const loc of ENABLED_LOCALES) {
        if (loc === DEFAULT_LOCALE) continue;
        localeTrans[loc] = loadTranslations(loc);
      }

      const htmlFiles = walkHtml(distDir).filter(
        // Skip the console SPA — its strings are handled by react-i18next.
        (rel) => !rel.startsWith("console/"),
      );

      let emittedCount = 0;
      for (const rel of htmlFiles) {
        const absPath = path.join(distDir, rel);
        const rawHtml = readFileSync(absPath, "utf-8");

        for (const locale of ENABLED_LOCALES) {
          const trans = localeTrans[locale] ?? {};
          let out = substituteTokens(rawHtml, locale, trans, enTrans);
          out = setHtmlLang(out, locale);
          out = injectHreflang(out, siteUrl, rel);

          const targetPath =
            locale === DEFAULT_LOCALE
              ? absPath
              : path.join(distDir, locale, rel);
          mkdirSync(path.dirname(targetPath), { recursive: true });
          writeFileSync(targetPath, out, "utf-8");
          emittedCount++;
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `[mega-x-partials] emitted ${emittedCount} HTML files across ` +
          `${ENABLED_LOCALES.length} locales (${ENABLED_LOCALES.join(", ")})`,
      );
    },
  };
}
