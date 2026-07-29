import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/**
 * FastAPI (:8001) runs on the Docker host, but this dev server may run either
 * on the host or inside the `lgh` container (host :7333 → container :5173).
 * Inside the container 127.0.0.1:8001 is dead — proxy to the container's
 * default gateway (the host) instead. Gateway is parsed from /proc/net/route
 * so we never hardcode a docker network IP. Override with VITE_API_TARGET.
 */
function apiTarget(): string {
  if (process.env.VITE_API_TARGET) return process.env.VITE_API_TARGET;
  if (existsSync("/.dockerenv")) {
    try {
      for (const line of readFileSync("/proc/net/route", "utf8").split("\n").slice(1)) {
        const [, dest, gwHex] = line.trim().split(/\s+/);
        if (dest === "00000000" && gwHex) {
          const gw = (gwHex.match(/../g) as string[])
            .reverse()
            .map((h) => parseInt(h, 16))
            .join(".");
          return `http://${gw}:8001`;
        }
      }
    } catch {
      // fall through to localhost
    }
  }
  return "http://127.0.0.1:8001";
}
const API_TARGET = apiTarget();

import { megaxPartials } from "./tools/vite-plugin-partials";
import { consoleSpaFallback } from "./tools/vite-plugin-console-fallback";
import { consoleSpaPaths } from "./tools/vite-plugin-console-spa-paths";

/**
 * Unified Vite config for the whole Mega X site.
 *
 *  - Marketing pages (index.html / about.html / phyntom-x8.html / …) are
 *    served as a multi-page app (MPA). Vite has native MPA support — each
 *    .html listed under build.rollupOptions.input becomes its own entry.
 *  - Phyntom X8 Console at /console/index.html is a React SPA. Vite's React
 *    plugin handles the .tsx files there. The custom consoleSpaFallback
 *    plugin rewrites unknown /console/* paths to /console/index.html so
 *    react-router can take over (mirrors nginx try_files in production).
 *  - The megaxPartials plugin replaces tools/inject_partials.py at
 *    dev/build time — it substitutes {{var}} placeholders between the
 *    <!-- partial:NAME --> markers using partials/pages.json.
 *
 * One process: `npm run dev`. Marketing pages: http://localhost:5173/
 * Console: http://localhost:5173/console/
 */
export default defineConfig({
  // @ pulls from console/src (the only TS subtree using path aliases).
  resolve: {
    alias: {
      "@": resolve(__dirname, "./console/src"),
    },
  },

  // The React plugin only matters for the console subtree; marketing pages
  // are plain HTML/CSS/JS and pass through untouched.
  plugins: [
    react({ include: ["console/**/*.{ts,tsx,jsx}"] }),
    megaxPartials({ root: __dirname }),
    consoleSpaFallback(),   // dev-only: rewrites /console/* to console/index.html
    consoleSpaPaths(),      // build-only: emits dist/console/<route>/index.html for static hosting
  ],

  server: {
    port: 5173,
    strictPort: true,
    // Recruiter WS + /v1 HTTP must hit FastAPI :8001 directly.
    // mega-x urllib proxy does not forward WebSocket Upgrade.
    proxy: {
      "/v1": {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Marketing pages — each is one dir + index.html (per-page directory
        // layout since 2026-06-24). Slug keys mirror the URL path.
        index: resolve(__dirname, "index.html"),
        "404": resolve(__dirname, "404.html"),
        company: resolve(__dirname, "company/index.html"),
        contact: resolve(__dirname, "contact/index.html"),
        "phyntom-x8": resolve(__dirname, "phyntom-x8/index.html"),
        "fann-gaming-ai": resolve(__dirname, "fann-gaming-ai/index.html"),
        chipnexus: resolve(__dirname, "chipnexus/index.html"),
        "nuclear-fusion-energy": resolve(__dirname, "nuclear-fusion-energy/index.html"),
        "chipnexus-freya": resolve(__dirname, "chipnexus/products/freya/index.html"),
        "chipnexus-glink": resolve(__dirname, "chipnexus/products/glink/index.html"),
        "chipnexus-flexv": resolve(__dirname, "chipnexus/products/flexv/index.html"),
        // Console SPA shell
        console: resolve(__dirname, "console/index.html"),
      },
    },
  },
});
