/**
 * Vite plugin — partial injection for mega-x marketing pages.
 *
 * Replaces tools/inject_partials.py at dev/build time. Reads partials/pages.json
 * + partials/*.html, substitutes {{var}} placeholders, and swaps the content
 * between `<!-- partial:NAME -->` markers in each entry HTML.
 *
 * Only handles the "replace between existing markers" case — all current
 * mega-x HTML files already have markers (inject_partials.py one-time-wrapped
 * them). The legacy "wrap-from-scratch" branch from the Python script is not
 * ported; if a future page is added without markers, run the Python script
 * once to wrap it, then this plugin takes over.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export interface MegaxPartialsOptions {
  /** mega-x root directory (where partials/ lives). */
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function megaxPartials(opts: MegaxPartialsOptions): Plugin {
  const root = opts.root;
  const partialsDir = path.join(root, "partials");
  const pagesJsonPath = path.join(partialsDir, "pages.json");

  const loadPages = (): PagesConfig =>
    JSON.parse(readFileSync(pagesJsonPath, "utf-8"));

  const loadPartial = (name: string): string =>
    readFileSync(path.join(partialsDir, `${name}.html`), "utf-8").replace(/\n+$/, "");

  /** Mirrors Python `active_attr`: returns the inline style attr for the active page. */
  const activeAttr = (item: string, active: unknown): string =>
    active && item === active ? ' style="color:var(--color-primary);"' : "";

  const renderNav = (cfg: PageCfg): string => {
    let tpl = loadPartial("nav");
    const navExtra = cfg.navExtraClass ? ` ${cfg.navExtraClass}` : "";
    tpl = tpl.replace("{{nav-extra-class}}", navExtra);
    if (cfg.homeInNav !== false) {
      tpl = tpl.replace(
        "{{home-li}}",
        `<li><a href="index.html"${activeAttr("home", cfg.active)}>Home</a></li>`,
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
      tpl = tpl.replace("{{home-link}}", '<a href="index.html">Home</a>');
    } else {
      tpl = tpl.replace(/\n[ \t]*\{\{home-link\}\}/, "");
    }
    return tpl;
  };

  const renderFooter = (cfg: PageCfg, defaults: Defaults): string => {
    const tpl = loadPartial("footer");
    const tagline = cfg.tagline ?? defaults.tagline ?? "";
    return tpl.replace("{{tagline}}", tagline);
  };

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
    const title = cfg.title ?? "";
    const description = cfg.description ?? "";
    const ogTitle = cfg.ogTitle ?? title;
    const ogDescription = cfg.ogDescription ?? description;
    return tpl
      .replace("{{title}}", title)
      .replace("{{description}}", description)
      .replace(/\{\{canonicalUrl\}\}/g, canonicalUrl)
      .replace(/\{\{ogTitle\}\}/g, ogTitle)
      .replace(/\{\{ogDescription\}\}/g, ogDescription)
      .replace(/\{\{ogImageUrl\}\}/g, ogImageUrl)
      .replace("{{twitterCard}}", twitterCard)
      .replace("{{robots}}", robots);
  };

  const replaceBetweenMarkers = (text: string, name: string, body: string): string => {
    const open = `<!-- partial:${name} -->`;
    const close = `<!-- /partial:${name} -->`;
    const re = new RegExp(
      `([ \\t]*)${escapeRe(open)}\\n[\\s\\S]*?\\n[ \\t]*${escapeRe(close)}`,
      "g",
    );
    return text.replace(re, (_m, lead) => `${lead}${open}\n${body}\n${lead}${close}`);
  };

  const removeMarker = (text: string, name: string): string => {
    const open = `<!-- partial:${name} -->`;
    const close = `<!-- /partial:${name} -->`;
    const re = new RegExp(
      `[ \\t]*${escapeRe(open)}\\n[\\s\\S]*?\\n[ \\t]*${escapeRe(close)}\\n?`,
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
      out = replaceBetweenMarkers(out, "footer", renderFooter(cfg, defaults));
    } else {
      out = removeMarker(out, "footer");
    }
    if (cfg.title) {
      out = replaceBetweenMarkers(out, "seo", renderSeo(rel, cfg, defaults));
    }
    return out;
  };

  return {
    name: "mega-x-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // ctx.path is like "/index.html" or "/products/freya.html" in dev,
        // and the build-time virtual path in prod. Strip leading slash to
        // match pages.json keys.
        const rel = (ctx.path ?? "").replace(/^\//, "");
        return renderPage(html, rel);
      },
    },
  };
}
