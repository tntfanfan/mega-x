/**
 * Vite plugin — kept as a no-op shim after the HashRouter migration.
 *
 * History:
 *   v1: emitted physical SPA-shell HTML files at every known Console route
 *       (e.g. /console/business/, /console/business/dashboard/, ...).
 *       Needed because BrowserRouter on a static host returns 404 for any
 *       path with no physical file backing it.
 *
 *   v2 (current): we switched the Console to HashRouter in main.tsx —
 *       all SPA routes live in `window.location.hash` and never reach
 *       the server. Browser only ever requests /console/index.html (one
 *       real file). No deep-path shells needed; no Amplify rewrite rule
 *       needed either.
 *
 * Why keep the plugin file: vite.config.ts still imports it. Rather than
 * touch the config (which is user-maintained), this no-op is safer.
 * If you ever switch back to BrowserRouter, restore git history of this
 * file to recover the deep-route shell logic.
 */
import type { Plugin } from "vite";

export function consoleSpaPaths(): Plugin {
  return {
    name: "console-spa-paths",
    apply: "build",
    closeBundle() {
      // eslint-disable-next-line no-console
      console.log("[console-spa-paths] HashRouter — no deep-route shells needed");
    },
  };
}
