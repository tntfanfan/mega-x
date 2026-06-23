import { Routes, Route, Navigate, Link, Outlet } from "react-router-dom";

import { isMockMode } from "./lib/mocks";

import LandingChoose from "./pages/Landing";

import BusinessLanding from "./pages/business/Landing";
import BusinessDashboard from "./pages/business/Dashboard";

import SoloLanding from "./pages/solo/Landing";
import SoloDashboard from "./pages/solo/Dashboard";

import DevLanding from "./pages/dev/Landing";
import DevHome from "./pages/dev/Home";

import AdminLanding from "./pages/admin/Landing";
import AdminQueue from "./pages/admin/ReviewQueue";

function ConsoleShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-solid bg-surface/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="font-display text-xl text-heading flex items-center gap-3">
            <span>Phyntom <span className="text-primary">X8</span></span>
            {isMockMode() && (
              <span
                title="UI is using fixture data from lib/mocks.ts; no requests to FastAPI. Set VITE_USE_MOCK=false in .env.development to use real backend."
                className="text-[10px] tracking-widest uppercase font-mono px-2 py-0.5 rounded bg-fusion/20 text-fusion border border-fusion/40"
              >
                mock api
              </span>
            )}
          </Link>
          <nav className="flex gap-6 text-sm text-body">
            <Link to="/business/" className="hover:text-primary">For Business</Link>
            <Link to="/solo/" className="hover:text-primary">For Solo</Link>
            <Link to="/dev/" className="hover:text-primary">For Builders</Link>
            <Link to="/admin/" className="hover:text-primary">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border-solid py-6 text-center text-xs text-muted">
        © 2026 Mega X Holding Ltd. · Phyntom X8 Console
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ConsoleShell />}>
        <Route index element={<LandingChoose />} />

        <Route path="business">
          <Route index element={<BusinessLanding />} />
          <Route path="dashboard" element={<BusinessDashboard />} />
        </Route>

        <Route path="solo">
          <Route index element={<SoloLanding />} />
          <Route path="dashboard" element={<SoloDashboard />} />
        </Route>

        <Route path="dev">
          <Route index element={<DevLanding />} />
          <Route path="home" element={<DevHome />} />
        </Route>

        <Route path="admin">
          <Route index element={<AdminLanding />} />
          <Route path="review-queue" element={<AdminQueue />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
