/**
 * Vite plugin — SPA fallback for the /console/* sub-app.
 *
 * mega-x is an MPA (each .html is its own page) but the console at /console/
 * is a React SPA with client-side routing (react-router). When the browser
 * requests /console/business/dashboard, there's no file at that path on disk
 * — we need Vite to serve console/index.html so React Router can take over.
 *
 * In production, nginx config does the same via try_files. This plugin only
 * matters for the dev server.
 */
import type { Plugin } from "vite";

export function consoleSpaFallback(): Plugin {
  return {
    name: "console-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        // Skip Vite internals (HMR, module loading, etc.)
        if (req.url.startsWith("/@") || req.url.startsWith("/node_modules/")) return next();

        const [pathname, search] = req.url.split("?", 2);
        if (!pathname.startsWith("/console/")) return next();

        // If the URL points to a real file (has a recognisable file extension)
        // let Vite handle it normally — the SPA's assets must resolve.
        const looksLikeFile = /\.[a-zA-Z0-9]{1,6}$/.test(pathname);
        if (looksLikeFile) return next();

        // Otherwise it's an SPA route — rewrite to the SPA shell.
        req.url = "/console/index.html" + (search ? `?${search}` : "");
        next();
      });
    },
  };
}
