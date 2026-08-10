/**
 * /solo/l/:lineId/* — single-line immersion shell.
 *
 * Same structure as CompanyShell: switcher + token usage + ChatProvider.
 * Sidebar: 集市 → 团队 → 聊天 → 任务 → 作品集 → 设置.
 */

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { CompanySwitcher } from "../../../components/layout/CompanySwitcher";
import { ChatProvider } from "./ChatProvider";

type State =
  | { kind: "loading" }
  | { kind: "ok"; line: Company; lines: Company[] }
  | { kind: "not-found" }
  | { kind: "error"; error: string };

function useLine(id: string | undefined): State {
  const [s, setS] = useState<State>({ kind: "loading" });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let linesCache: Company[] = [];

    const load = (includeList = false) => {
      const lineReq = api.get<Company>(`/v1/lines/${id}`);
      const listReq =
        includeList || linesCache.length === 0
          ? api.get<{ items: Company[] }>("/v1/lines")
          : Promise.resolve({ items: linesCache });

      Promise.all([lineReq, listReq])
        .then(([line, all]) => {
          if (cancelled) return;
          linesCache = all.items;
          setS({ kind: "ok", line, lines: all.items });
          if (line.state === "provisioning") {
            timer = setTimeout(() => load(false), 3000);
          }
        })
        .catch((e) => {
          if (cancelled) return;
          const status =
            e && typeof e === "object" && "status" in e
              ? (e as { status: number }).status
              : 0;
          setS(status === 404 ? { kind: "not-found" } : { kind: "error", error: String(e) });
        });
    };

    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);
  return s;
}

export default function LineShell() {
  const { lineId } = useParams<{ lineId: string }>();
  const { t } = useTranslation();
  const state = useLine(lineId);

  if (state.kind === "loading") {
    return (
      <div className="container py-10">
        <p className="text-sm">{t("common.loading")}…</p>
      </div>
    );
  }
  if (state.kind === "not-found") return <Navigate to="/solo/overview" replace />;
  if (state.kind === "error") {
    return (
      <div className="container py-10">
        <p className="text-fusion text-sm">{state.error}</p>
      </div>
    );
  }

  const { line, lines } = state;
  return (
    <ChatProvider line={line}>
      <div className="min-h-[calc(100vh-8rem)] flex flex-col">
        <LineHeader line={line} lines={lines} />
        <div className="flex flex-1">
          <LineSidebar lineId={line.id} />
          <main className="flex-1 min-w-0">
            <Outlet context={{ line, lines }} />
          </main>
        </div>
      </div>
    </ChatProvider>
  );
}

function LineHeader({ line, lines }: { line: Company; lines: Company[] }) {
  const { t } = useTranslation();
  const stateBadge = {
    running: { label: t("solo.overview.lines.state.running"), color: "text-spark-mint" },
    paused: { label: t("solo.overview.lines.state.paused"), color: "text-spark-flare" },
    provisioning: { label: t("solo.overview.lines.state.provisioning"), color: "text-spark-blue" },
    error: { label: t("solo.overview.lines.state.error"), color: "text-fusion" },
  }[line.state];

  return (
    <header className="border-b border-border-solid bg-surface px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/solo/overview"
            className="inline-block text-xs text-muted hover:text-primary shrink-0 rtl:-scale-x-100"
            title={t("solo.switcher.go-overview")}
          >
            ←
          </Link>
          <span className="text-2xl shrink-0">{line.emoji}</span>
          <CompanySwitcher
            current={line}
            companies={lines}
            itemBasePath="/solo/l"
            createPath="/solo/lines/new"
            labelKey="solo.switcher.label"
            createKey="solo.switcher.create"
            emptyKey="solo.switcher.empty"
            countSuffixKey="solo.overview.lines.teams-suffix"
          />
          <span className={`text-xs ${stateBadge.color} shrink-0`}>{stateBadge.label}</span>
        </div>
        <div className="text-[11px] text-muted whitespace-nowrap">
          {t("solo.line.subtitle.token-usage", {
            tokens: line.token_usage_30d.toLocaleString(),
          })}
        </div>
      </div>
    </header>
  );
}

function LineSidebar({ lineId }: { lineId: string }) {
  const { t } = useTranslation();
  const tabs: { key: string; to: string; end?: boolean; label: string }[] = [
    { key: "marketplace", to: "marketplace", label: t("solo.line.tab.marketplace") },
    { key: "team", to: "", end: true, label: t("solo.line.tab.team") },
    { key: "chat", to: "chat", label: t("solo.line.tab.chat") },
    { key: "tasks", to: "tasks", label: t("solo.line.tab.tasks") },
    { key: "portfolio", to: "portfolio", label: t("solo.line.tab.portfolio") },
    { key: "settings", to: "settings", label: t("solo.line.tab.settings") },
  ];
  return (
    <aside className="w-48 shrink-0 border-e border-border-solid bg-surface/60 py-4">
      <nav className="flex flex-col">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            end={tab.end}
            to={tab.to ? `/solo/l/${lineId}/${tab.to}` : `/solo/l/${lineId}/`}
            className={({ isActive }) =>
              `px-4 py-2 text-sm transition-colors border-s-2 ${
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
