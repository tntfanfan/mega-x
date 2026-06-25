import { Routes, Route, Navigate, Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { isMockMode } from "./lib/mocks";
import LanguageSwitcher from "./components/LanguageSwitcher";

import LandingChoose from "./pages/Landing";

// Business
import BusinessLanding from "./pages/business/Landing";
import BusinessOverview from "./pages/business/Overview";
import CompaniesList from "./pages/business/companies/List";
import NewWizard from "./pages/business/companies/NewWizard";
import CompanyShell from "./pages/business/company/CompanyShell";
import CanvasView from "./pages/business/company/CanvasView";
import DeptsView from "./pages/business/company/DeptsView";
import TasksList from "./pages/business/company/TasksList";
import TaskDetail from "./pages/business/company/TaskDetail";
import TaskNew from "./pages/business/company/TaskNew";
import Outputs from "./pages/business/company/Outputs";
import Conversations from "./pages/business/company/Conversations";
import CompanyMarketplace from "./pages/business/company/Marketplace";
import Settings from "./pages/business/company/Settings";

// Solo (超级个体 — 完全独立 IA：产线 + 团队 + 杠杆)
import SoloLanding from "./pages/solo/Landing";
import SoloOverview from "./pages/solo/Overview";
import SoloLinesList from "./pages/solo/lines/List";
import SoloNewWizard from "./pages/solo/lines/NewWizard";
import LineShell from "./pages/solo/line/LineShell";
import TeamView from "./pages/solo/line/TeamView";
import PortfolioView from "./pages/solo/line/PortfolioView";
import TimelineView from "./pages/solo/line/TimelineView";
import BillingView from "./pages/solo/line/BillingView";
import SettingsView from "./pages/solo/line/SettingsView";

// Dev / Admin (S11 才发力)
import DevLanding from "./pages/dev/Landing";
import DevHome from "./pages/dev/Home";
import DevStudio from "./pages/dev/Studio";
import AdminLanding from "./pages/admin/Landing";
import AdminQueue from "./pages/admin/ReviewQueue";

function ConsoleShell() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-solid bg-surface/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="font-display text-xl text-heading flex items-center gap-3">
            <span>Phyntom <span className="text-primary">X8</span></span>
            {isMockMode() && (
              <span
                title={t("shell.mock-badge.tooltip")}
                className="text-[10px] tracking-widest uppercase font-mono px-2 py-0.5 rounded bg-fusion/20 text-fusion border border-fusion/40"
              >
                {t("shell.mock-badge")}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex gap-6 text-sm text-body">
              <Link to="/business/" className="hover:text-primary">{t("shell.nav.business")}</Link>
              <Link to="/solo/" className="hover:text-primary">{t("shell.nav.solo")}</Link>
              <Link to="/dev/" className="hover:text-primary">{t("shell.nav.builders")}</Link>
              <Link to="/admin/" className="hover:text-primary">{t("shell.nav.admin")}</Link>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border-solid py-6 text-center text-xs text-muted">
        {t("shell.footer")}
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
          <Route index element={<BusinessLanding />} />            {/* /business/ → Landing（与 solo/dev/admin 对称）*/}
          <Route path="overview" element={<BusinessOverview />} /> {/* /business/overview → 全局总览（主工作页）*/}

          <Route path="companies">
            <Route index element={<CompaniesList />} />
            <Route path="new" element={<NewWizard />} />
          </Route>

          {/* 单公司沉浸视图 */}
          <Route path="c/:companyId" element={<CompanyShell />}>
            <Route index element={<CanvasView />} />              {/* /business/c/:id/ → Canvas */}
            <Route path="depts" element={<DeptsView />} />
            <Route path="tasks" element={<TasksList />} />
            <Route path="tasks/new" element={<TaskNew />} />
            <Route path="tasks/:taskId" element={<TaskDetail />} />
            <Route path="outputs" element={<Outputs />} />
            <Route path="conversations" element={<Conversations />} />
            <Route path="marketplace" element={<CompanyMarketplace />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="solo">
          <Route index element={<SoloLanding />} />
          <Route path="overview" element={<SoloOverview />} />
          <Route path="lines">
            <Route index element={<SoloLinesList />} />
            <Route path="new" element={<SoloNewWizard />} />
          </Route>
          <Route path="l/:lineId" element={<LineShell />}>
            <Route index element={<TeamView />} />
            <Route path="portfolio" element={<PortfolioView />} />
            <Route path="timeline" element={<TimelineView />} />
            <Route path="billing" element={<BillingView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>
        </Route>

        <Route path="dev">
          <Route index element={<DevLanding />} />
          <Route path="home" element={<DevHome />} />
          <Route path="depts/:deptId/studio" element={<DevStudio />} />
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
