/**
 * /business/c/:companyId/* — Single-company shell.
 *
 * 包裹所有单公司视图（Canvas / Depts / Tasks / Outputs / Conversations /
 * Marketplace / Settings）。结构：
 *   TopBar       公司切换器 + 公司名 + 状态徽章
 *   Sidebar      tab 切换 + 跨公司导航回链
 *   MainContent  各 tab 通过 react-router <Outlet/> 渲染
 */

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { CompanySwitcher } from "../../../components/layout/CompanySwitcher";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; company: Company; companies: Company[] }
  | { kind: "not-found" }
  | { kind: "error"; error: string };

function useCompany(companyId: string | undefined): LoadState {
  const [s, setS] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    Promise.all([
      api.get<Company>(`/v1/companies/${companyId}`),
      api.get<{ items: Company[] }>("/v1/companies"),
    ])
      .then(([co, all]) => {
        if (!cancelled) setS({ kind: "ok", company: co, companies: all.items });
      })
      .catch((e) => {
        if (cancelled) return;
        const status = e && typeof e === "object" && "status" in e ? (e as { status: number }).status : 0;
        if (status === 404) setS({ kind: "not-found" });
        else setS({ kind: "error", error: String(e) });
      });
    return () => { cancelled = true; };
  }, [companyId]);

  return s;
}

export default function CompanyShell() {
  const { companyId } = useParams<{ companyId: string }>();
  const state = useCompany(companyId);

  if (state.kind === "loading") {
    return <div className="container py-10"><p className="text-body text-sm">Loading…</p></div>;
  }
  if (state.kind === "not-found") {
    return <Navigate to="/business/" replace />;
  }
  if (state.kind === "error") {
    return <div className="container py-10"><p className="text-fusion text-sm">{state.error}</p></div>;
  }

  const { company, companies } = state;
  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col">
      <CompanyHeader company={company} companies={companies} />
      <div className="flex flex-1">
        <CompanySidebar companyId={company.id} />
        <main className="flex-1 min-w-0">
          <Outlet context={{ company, companies }} />
        </main>
      </div>
    </div>
  );
}

function CompanyHeader({ company, companies }: { company: Company; companies: Company[] }) {
  const { t } = useTranslation();
  const stateBadge = {
    running: { label: t("business.company.subtitle.running"), color: "text-spark-mint" },
    paused: { label: t("business.company.subtitle.paused"), color: "text-spark-flare" },
    provisioning: { label: t("business.overview.company.state.provisioning"), color: "text-spark-blue" },
    error: { label: t("business.overview.company.state.error"), color: "text-fusion" },
  }[company.state];

  return (
    <header className="border-b border-border-solid bg-surface px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/business/"
            className="text-xs text-muted hover:text-primary shrink-0"
            title={t("shell.switcher.go-overview")}
          >
            ←
          </Link>
          <span className="text-2xl shrink-0">{company.emoji}</span>
          <CompanySwitcher current={company} companies={companies} />
          <span className={`text-xs ${stateBadge.color} shrink-0`}>{stateBadge.label}</span>
        </div>
        <div className="text-[11px] text-muted whitespace-nowrap">
          {t("business.company.subtitle.token-usage", {
            tokens: company.token_usage_30d.toLocaleString(),
          })}
        </div>
      </div>
    </header>
  );
}

function CompanySidebar({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const tabs: { key: string; to: string; end?: boolean; label: string }[] = [
    { key: "canvas", to: ``, end: true, label: t("business.company.tab.canvas") },
    { key: "depts", to: "depts", label: t("business.company.tab.depts") },
    { key: "tasks", to: "tasks", label: t("business.company.tab.tasks") },
    { key: "outputs", to: "outputs", label: t("business.company.tab.outputs") },
    { key: "conversations", to: "conversations", label: t("business.company.tab.conversations") },
    { key: "marketplace", to: "marketplace", label: t("business.company.tab.marketplace") },
    { key: "settings", to: "settings", label: t("business.company.tab.settings") },
  ];

  return (
    <aside className="w-48 shrink-0 border-r border-border-solid bg-surface/60 py-4">
      <nav className="flex flex-col">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            end={tab.end}
            to={tab.to ? `/business/c/${companyId}/${tab.to}` : `/business/c/${companyId}/`}
            className={({ isActive }) =>
              `px-4 py-2 text-sm transition-colors border-l-2 ${
                isActive
                  ? "border-primary text-primary bg-surface-2"
                  : "border-transparent text-body hover:text-primary hover:bg-surface-2"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
