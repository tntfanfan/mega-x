/**
 * /solo/overview — 一人工作室仪表盘。
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ 📊 我的一人工作室              + 新建产线      │
 *   │ ──────────────────────────────────────────── │
 *   │ 💰¥X   📦Y   ⏱Zh   📈+N%   (4 个杠杆 KPI)    │
 *   │ ──────────────────────────────────────────── │
 *   │ 我的产线 (N)                                  │
 *   │  [产线卡] [产线卡] [产线卡] [+ 新建]            │
 *   │ ──────────────────────────────────────────── │
 *   │ 🔥 今天的产出物                                 │
 *   │  [作品 tile] [作品 tile] [作品 tile]            │
 *   └──────────────────────────────────────────────┘
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../lib/api";
import type { Company, Artifact } from "../../lib/api";
import { LeverageKPI, type LeverageKpiData } from "../../components/solo/LeverageKPI";
import { PortfolioTile } from "../../components/solo/PortfolioTile";

interface LinesResp { items: Company[]; total: number }

function fmtTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function isToday(iso: string): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 24 * 60 * 60 * 1000;
}

export default function SoloOverview() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<Company[]>([]);
  const [kpi, setKpi] = useState<LeverageKpiData | null>(null);
  const [todayArtifacts, setTodayArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<LinesResp>("/v1/lines"),
      api.get<LeverageKpiData>("/v1/leverage"),
    ])
      .then(async ([linesRes, leverageRes]) => {
        if (cancelled) return;
        setLines(linesRes.items);
        setKpi(leverageRes);
        // 拉每条产线的 artifacts，过滤今天的
        const artifactLists = await Promise.all(
          linesRes.items.map((line) =>
            api.get<{ items: Artifact[] }>(`/v1/lines/${line.id}/artifacts`)
              .then((r) => r.items)
              .catch(() => [] as Artifact[])
          )
        );
        if (cancelled) return;
        const allArtifacts = artifactLists.flat();
        const todayArts = allArtifacts
          .filter((a) => isToday(a.created_at))
          .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
          .slice(0, 8);
        setTodayArtifacts(todayArts);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !kpi) {
    return <section className="container py-10"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  }

  return (
    <section className="container py-10 space-y-8">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 · Solo</p>
          <h1 className="font-display text-3xl text-heading">{t("solo.overview.title")}</h1>
          <p className="text-sm text-muted mt-1">{t("solo.overview.subtitle")}</p>
        </div>
        <Link
          to="/solo/lines/new"
          className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("solo.overview.lines.create")}
        </Link>
      </header>

      {/* Leverage KPI */}
      <LeverageKPI data={kpi} emphasize="revenue" />

      {/* Lines */}
      <section className="space-y-3">
        <h2 className="font-display text-xl text-heading">{t("solo.overview.lines.title")}</h2>
        {lines.length === 0 ? (
          <EmptyLines />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lines.map((line) => (
              <LineCard key={line.id} line={line} />
            ))}
            <CreateLineCard />
          </div>
        )}
      </section>

      {/* Today's outputs */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-xl text-heading">{t("solo.overview.outputs.title")}</h2>
          {todayArtifacts.length > 0 && (
            <Link to="/solo/overview" className="text-xs text-primary hover:underline">
              {t("solo.overview.outputs.see-all")}
            </Link>
          )}
        </header>
        {todayArtifacts.length === 0 ? (
          <p className="text-sm text-muted">{t("solo.overview.outputs.empty")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {todayArtifacts.map((a) => (
              <PortfolioTile key={a.id} artifact={a} />
            ))}
          </div>
        )}
      </section>

      {/* time-ago footnote */}
      <p className="text-[10px] text-dim text-center">
        {fmtTimeAgo(new Date().toISOString())} · Mock 模式 · 数据来自 lib/fixtures.ts
      </p>
    </section>
  );
}

function LineCard({ line }: { line: Company }) {
  const { t } = useTranslation();
  const stateLabel = t(`solo.overview.lines.state.${line.state}`);
  return (
    <Link
      to={`/solo/l/${line.id}/`}
      className="group rounded-md border border-border-solid bg-surface p-5 hover:border-primary transition-colors flex flex-col"
    >
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">{line.emoji}</span>
          <div>
            <h3 className="font-display text-base text-heading group-hover:text-primary">{line.name}</h3>
            <p className="text-[11px] text-muted">{line.template_slug}</p>
          </div>
        </div>
        <span className="text-[10px] text-muted">{stateLabel}</span>
      </header>

      <div className="mt-3 flex items-center gap-3 text-xs text-body">
        <span>{t("solo.overview.lines.teammates-count", { count: line.dept_ids.length * 3 /* mock */ })}</span>
        <span className="text-dim">·</span>
        <span>
          {line.active_tasks > 0
            ? t("solo.overview.lines.active-tasks", { count: line.active_tasks })
            : t("solo.overview.lines.tasks-zero")}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-border-solid grid grid-cols-3 gap-2 text-[10px] text-center">
        <div>
          <div className="text-spark-mint font-display text-sm">¥{(line.revenue_30d ?? 0).toLocaleString()}</div>
          <div className="text-muted">月入</div>
        </div>
        <div>
          <div className="text-heading font-display text-sm">{line.output_count_30d ?? 0}</div>
          <div className="text-muted">月产</div>
        </div>
        <div>
          <div className="text-spark-blue font-display text-sm">{line.hours_saved_30d ?? 0}h</div>
          <div className="text-muted">省工</div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-body truncate">💬 {line.last_activity_text}</div>

      <div className="mt-3 text-right text-[11px] text-primary group-hover:underline">
        {t("solo.overview.lines.enter")}
      </div>
    </Link>
  );
}

function CreateLineCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/solo/lines/new"
      className="rounded-md border border-dashed border-border-solid bg-surface/40 p-5 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-surface/80 transition-colors min-h-[220px]"
    >
      <div className="text-4xl text-primary opacity-70">＋</div>
      <h3 className="font-display text-base text-heading mt-2">{t("solo.overview.lines.create")}</h3>
    </Link>
  );
}

function EmptyLines() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border-solid bg-surface p-12 text-center">
      <p className="text-body">{t("solo.overview.lines.empty")}</p>
      <Link
        to="/solo/lines/new"
        className="inline-block mt-4 rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
      >
        {t("solo.overview.lines.create")}
      </Link>
    </div>
  );
}
