import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

import { megaxPartials } from "./tools/vite-plugin-partials";
import { consoleSpaFallback } from "./tools/vite-plugin-console-fallback";

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
    consoleSpaFallback(),
  ],

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Marketing pages — kebab-case keys mirror the file names.
        index: resolve(__dirname, "index.html"),
        "404": resolve(__dirname, "404.html"),
        about: resolve(__dirname, "about.html"),
        contact: resolve(__dirname, "contact.html"),
        "phyntom-x8": resolve(__dirname, "phyntom-x8.html"),
        "fann-gaming-ai": resolve(__dirname, "fann-gaming-ai.html"),
        "wifi-iot-chips": resolve(__dirname, "wifi-iot-chips.html"),
        "nuclear-fusion-energy": resolve(__dirname, "nuclear-fusion-energy.html"),
        "products-freya": resolve(__dirname, "products/freya.html"),
        "products-glink": resolve(__dirname, "products/glink.html"),
        "products-flexv": resolve(__dirname, "products/flexv.html"),
        // Console SPA shell
        console: resolve(__dirname, "console/index.html"),
      },
    },
  },
});
