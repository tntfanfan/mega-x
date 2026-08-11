import { Routes, Route, Navigate, Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { isMockMode } from "./lib/mocks";
import { useAuth } from "./lib/auth";
import LanguageSwitcher from "./components/LanguageSwitcher";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";

import LandingChoose from "./pages/Landing";
import LoginPage from "./pages/Login";

// Business
import BusinessLanding from "./pages/business/Landing";
import BusinessOverview from "./pages/business/Overview";
import CompaniesList from "./pages/business/companies/List";
import NewWizard from "./pages/business/companies/NewWizard";
import CompanyShell from "./pages/business/company/CompanyShell";
import DeptsView from "./pages/business/company/DeptsView";
import TasksList from "./pages/business/company/TasksList";
import TaskDetail from "./pages/business/company/TaskDetail";
import TaskNew from "./pages/business/company/TaskNew";
import ChatView from "./pages/business/company/ChatView";
import CompanyMarketplace from "./pages/business/company/Marketplace";
import Settings from "./pages/business/company/Settings";

// Solo (超级个体 — 完全独立 IA：产线 + 团队 + 杠杆)
import SoloLanding from "./pages/solo/Landing";
import SoloOverview from "./pages/solo/Overview";
import SoloLinesList from "./pages/solo/lines/List";
import SoloNewWizard from "./pages/solo/lines/NewWizard";
import LineShell from "./pages/solo/line/LineShell";
import TeamView from "./pages/solo/line/TeamView";
import SoloTasksList from "./pages/solo/line/TasksList";
import SoloTaskNew from "./pages/solo/line/TaskNew";
import SoloTaskDetail from "./pages/solo/line/TaskDetail";
import SoloChatView from "./pages/solo/line/ChatView";
import LineMarketplace from "./pages/solo/line/Marketplace";
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

function UserMenu() {
  const { t } = useTranslation();
  const { me, status, logout } = useAuth();
  if (status !== "authenticated" || !me) {
    return (
      <Link to="/login" className="text-sm text-primary hover:underline">
        {t("auth.login.title")}
      </Link>
    );
  }
  const label = me.user.display_name || me.user.email;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-body max-w-[10rem] truncate" title={me.user.email}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-muted hover:text-primary"
      >
        {t("auth.logout")}
      </button>
    </div>
  );
}

function ConsoleShell() {
  const { t } = useTranslation();
  const { me, status } = useAuth();
  const isAdmin = status === "authenticated" && !!me?.roles?.includes("admin");
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
            <nav
              aria-label={t("shell.nav.primary")}
              className="flex gap-6 text-sm text-body"
            >
              <Link to="/business/" className="hover:text-primary">{t("shell.nav.business")}</Link>
              <Link to="/solo/" className="hover:text-primary">{t("shell.nav.solo")}</Link>
              <Link to="/dev/" className="hover:text-primary">{t("shell.nav.builders")}</Link>
              {isAdmin && (
                <Link to="/admin/" className="hover:text-primary">{t("shell.nav.admin")}</Link>
              )}
            </nav>
            <LanguageSwitcher />
            <UserMenu />
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

function AuthedOutlet() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

function AdminOutlet() {
  return (
    <RequireAdmin>
      <Outlet />
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ConsoleShell />}>
        <Route index element={<LandingChoose />} />
        <Route path="login" element={<LoginPage />} />

        <Route path="business" element={<AuthedOutlet />}>
          <Route index element={<BusinessLanding />} />
          <Route path="overview" element={<BusinessOverview />} />

          <Route path="companies">
            <Route index element={<CompaniesList />} />
            <Route path="new" element={<NewWizard />} />
          </Route>

          <Route path="c/:companyId" element={<CompanyShell />}>
            <Route index element={<DeptsView />} />
            <Route path="depts" element={<Navigate to=".." replace />} />
            <Route path="chat" element={<ChatView />} />
            <Route path="tasks" element={<TasksList />} />
            <Route path="tasks/new" element={<TaskNew />} />
            <Route path="tasks/:taskId" element={<TaskDetail />} />
            <Route path="outputs" element={<Navigate to="../tasks?view=outputs" replace />} />
            <Route path="conversations" element={<Navigate to="../chat" replace />} />
            <Route path="marketplace" element={<CompanyMarketplace />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="solo" element={<AuthedOutlet />}>
          <Route index element={<SoloLanding />} />
          <Route path="overview" element={<SoloOverview />} />
          <Route path="lines">
            <Route index element={<SoloLinesList />} />
            <Route path="new" element={<SoloNewWizard />} />
          </Route>
          <Route path="l/:lineId" element={<LineShell />}>
            <Route index element={<TeamView />} />
            <Route path="chat" element={<SoloChatView />} />
            <Route path="tasks" element={<SoloTasksList />} />
            <Route path="tasks/new" element={<SoloTaskNew />} />
            <Route path="tasks/:taskId" element={<SoloTaskDetail />} />
            <Route path="conversations" element={<Navigate to="../chat" replace />} />
            <Route path="marketplace" element={<LineMarketplace />} />
            <Route path="portfolio" element={<PortfolioView />} />
            <Route path="timeline" element={<TimelineView />} />
            <Route path="billing" element={<BillingView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>
        </Route>

        <Route path="dev" element={<AuthedOutlet />}>
          <Route index element={<DevLanding />} />
          <Route path="home" element={<DevHome />} />
          <Route path="depts/:deptId/studio" element={<DevStudio />} />
        </Route>

        <Route path="admin" element={<AdminOutlet />}>
          <Route index element={<AdminLanding />} />
          <Route path="review-queue" element={<AdminQueue />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
