import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

// Side-effect import: configures i18next with EN + ZH and sets <html lang>.
import "./i18n";

import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/ui/Toast";
import "./styles/globals.css";

/**
 * HashRouter — chosen over BrowserRouter so SPA deep links work on **any**
 * static host with **zero rewrite-rule configuration** (Amplify / S3 /
 * CloudFront / nginx / netlify / gh-pages all treat it identically).
 *
 * Browser only ever loads /console/index.html (real file in dist/). The path
 * after `#` is purely client-side state; HTTP server never sees it. Refresh
 * on /console/#/business/c/c-saas/tasks/t-001 → server returns
 * console/index.html → React Router parses the hash and routes. No 404
 * surface, no infra config.
 *
 * Trade-off: URLs contain `#/` segment, e.g. mega-x.ai/console/#/business/c/c-saas/.
 * For an authed internal SaaS console where SEO doesn't matter, this is fine.
 *
 * Marketing-page hard-coded links to console must include the `#/` prefix:
 *   ❌ /console/business/        → lands at SPA root, not Business view
 *   ✅ /console/#/business/      → HashRouter routes to /business
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
