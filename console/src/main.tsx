import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Side-effect import: configures i18next with EN + ZH and sets <html lang>.
import "./i18n";

import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* basename matches Vite's `base: '/console/'`. Served at mega-x.ai/console/* */}
    <BrowserRouter basename="/console">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
