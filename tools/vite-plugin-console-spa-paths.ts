/**
 * Vite plugin — emit physical SPA-shell files at every known Console route.
 *
 * Why: Amplify (and most static-only hosts) returns 404 for paths that have
 * no file on S3, even with rewrites the response code path can be fragile.
 * The most bulletproof fix is "static SPA": pre-emit copies of
 * console/index.html at every client-side route. When the browser navigates
 * to /console/business/dashboard, CloudFront finds a real file and serves
 * it with 200; React Router takes over from there.
 *
 * Cost: a few extra ~3 KB HTML files in dist. Worth it for zero Amplify
 * Console config and zero rewrite-rule maintenance.
 *
 * Trade-off: when adding a new top-level Console route, also add it to
 * CONSOLE_ROUTES below. The router config in console/src/App.tsx is the
 * source of truth; this list mirrors it.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// Mirror of console/src/App.tsx route table (keep in sync).
// Each entry is the URL path relative to the site root.
//
// 注意：动态路径段如 /business/c/:companyId/* 无法在 build 时静态展开，
// 这些路径需要在托管层用 SPA rewrite 规则覆盖（见 amplify.yml 注释）。
const CONSOLE_ROUTES = [
  // Static landings
  "console/business",
  "console/business/companies",
  "console/business/companies/new",
  "console/solo",
  "console/solo/dashboard",
  "console/dev",
  "console/dev/home",
  "console/admin",
  "console/admin/review-queue",
];

export function consoleSpaPaths(opts: { distDir?: string } = {}): Plugin {
  return {
    name: "console-spa-paths",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(opts.distDir ?? "dist");
      const shellPath = path.join(distDir, "console", "index.html");
      if (!fs.existsSync(shellPath)) {
        // Console wasn't built (unexpected) — bail loudly.
        // eslint-disable-next-line no-console
        console.warn(`[console-spa-paths] expected SPA shell at ${shellPath}, skipping`);
        return;
      }
      const shellHtml = fs.readFileSync(shellPath, "utf-8");
      let emitted = 0;
      for (const route of CONSOLE_ROUTES) {
        const dir = path.join(distDir, route);
        const file = path.join(dir, "index.html");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, shellHtml);
        emitted++;
      }
      // eslint-disable-next-line no-console
      console.log(`[console-spa-paths] emitted ${emitted} SPA shells for deep routes`);
    },
  };
}
