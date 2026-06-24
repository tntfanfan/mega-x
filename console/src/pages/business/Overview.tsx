/**
 * /business/ — Global overview.
 *
 * 一眼看到自己的所有公司 + 跨公司任务流 + 全局 KPI 条。
 * 多公司用户的默认登陆页；单公司用户由 App.tsx 自动跳到唯一公司的 /c/:id/。
 */

import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../lib/api";
import type { Company, ActivityEvent, Task } from "../../lib/api";

interface OverviewData {
  companies: Company[];
  activity: ActivityEvent[];
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

function useOverview(): OverviewData {
  const [data, setData] = useState<OverviewData>({
    companies: [], activity: [], tasks: [], loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ items: Company[] }>("/v1/companies"),
      api.get<{ items: ActivityEvent[] }>("/v1/activity"),
    ])
      .then(async ([cs, acts]) => {
        // 收集每家公司的任务（mock 模式下也并行）
        const taskLists = await Promise.all(
          cs.items.map((c) =>
            api.get<{ items: Task[] }>(`/v1/companies/${c.id}/tasks`)
              .then((r) => r.items)
              .catch(() => [] as Task[])
          )
        );
        const tasks = taskLists.flat();
        if (!cancelled) {
          setData({ companies: cs.items, activity: acts.items, tasks, loading: false, error: null });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setData({ companies: [], activity: [], tasks: [], loading: false, error: String(e) });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return data;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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

export default function Overview() {
  const { t } = useTranslation();
  const { companies, activity, tasks, loading, error } = useOverview();

  const kpis = useMemo(() => {
    const totalDepts = companies.reduce((sum, c) => sum + c.dept_ids.length, 0);
    const activeTasks = tasks.filter((t) => t.state === "in_progress" || t.state === "review").length;
    const token30d = companies.reduce((sum, c) => sum + c.token_usage_30d, 0);
    return {
      companies: companies.length,
      depts: totalDepts,
      tasks: activeTasks,
      token30d,
    };
  }, [companies, tasks]);

  if (loading) {
    return (
      <section className="container py-10">
        <p className="text-body text-sm">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="container py-10">
        <p className="text-fusion text-sm">{error}</p>
      </section>
    );
  }

  return (
    <section className="container py-10 space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 for Business</p>
        <h1 className="font-display text-3xl text-heading">{t("business.overview.title")}</h1>
      </header>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t("business.overview.kpi.companies")} value={String(kpis.companies)} />
        <Kpi label={t("business.overview.kpi.depts")} value={String(kpis.depts)} />
        <Kpi label={t("business.overview.kpi.tasks")} value={String(kpis.tasks)} />
        <Kpi label={t("business.overview.kpi.token-30d")} value={fmtNumber(kpis.token30d)} />
      </div>

      {/* Company cards */}
      {companies.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} activity={activity.filter((a) => a.company_id === c.id).slice(0, 3)} />
          ))}
          <CreateCard />
        </div>
      )}

      {/* Cross-company task feed */}
      <section className="mt-8">
        <h2 className="font-display text-xl text-heading mb-3">{t("business.overview.cross-task-feed.title")}</h2>
        <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
          {tasks.length === 0 ? (
            <p className="p-4 text-muted text-sm">No tasks across companies.</p>
          ) : (
            tasks
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
              .slice(0, 12)
              .map((task) => {
                const co = companies.find((c) => c.id === task.company_id);
                return (
                  <TaskRow key={task.id} task={task} companyName={co?.name ?? task.company_id} companyEmoji={co?.emoji ?? "🏢"} />
                );
              })
          )}
        </div>
      </section>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-solid bg-surface px-4 py-3">
      <div className="text-[10px] tracking-widest uppercase text-muted">{label}</div>
      <div className="font-display text-2xl text-heading mt-1">{value}</div>
    </div>
  );
}

function CompanyCard({ company, activity }: { company: Company; activity: ActivityEvent[] }) {
  const { t } = useTranslation();
  const stateLabel = {
    running: t("business.overview.company.state.running"),
    paused: t("business.overview.company.state.paused"),
    provisioning: t("business.overview.company.state.provisioning"),
    error: t("business.overview.company.state.error"),
  }[company.state];

  return (
    <Link
      to={`/business/c/${company.id}/`}
      className="group rounded-md border border-border-solid bg-surface p-5 hover:border-primary transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{company.emoji}</span>
          <div>
            <h3 className="font-display text-lg text-heading group-hover:text-primary">{company.name}</h3>
            <p className="text-[11px] text-muted">{company.template_slug}</p>
          </div>
        </div>
        <span className="text-[10px] text-muted">{stateLabel}</span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-body">
        <span>{company.dept_ids.length}{t("business.overview.company.depts-suffix")}</span>
        <span className="text-dim">·</span>
        <span>
          {company.active_tasks > 0
            ? t("business.overview.company.tasks-running", { count: company.active_tasks })
            : t("business.overview.company.tasks-zero")}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-border-solid space-y-1">
        <div className="text-[10px] tracking-widest uppercase text-muted">
          {t("business.overview.company.last-event")}
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-dim">{t("business.overview.company.no-recent")}</p>
        ) : (
          <ul className="space-y-0.5">
            {activity.map((a) => (
              <li key={a.id} className="text-xs text-body truncate">
                <span className="text-muted text-[10px]">{fmtTimeAgo(a.ts)} · </span>
                {a.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
        <span>{t("business.overview.company.token-30d", { tokens: fmtNumber(company.token_usage_30d) })}</span>
        <span className="text-primary group-hover:underline">
          {t("business.overview.company.enter")}
        </span>
      </div>
    </Link>
  );
}

function CreateCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/business/companies/new"
      className="rounded-md border border-dashed border-border-solid bg-surface/40 p-5 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-surface/80 transition-colors min-h-[200px]"
    >
      <div className="text-4xl text-primary opacity-70">＋</div>
      <h3 className="font-display text-lg text-heading mt-2">{t("business.overview.create-card")}</h3>
      <p className="text-xs text-muted mt-1">{t("business.overview.create-card.subtitle")}</p>
    </Link>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border-solid bg-surface p-12 text-center">
      <p className="text-body">{t("business.overview.empty")}</p>
      <Link to="/business/companies/new" className="inline-block mt-4 rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition">
        {t("business.overview.empty.cta")}
      </Link>
    </div>
  );
}

function TaskRow({ task, companyName, companyEmoji }: { task: Task; companyName: string; companyEmoji: string }) {
  const stateBadge = {
    pending: { label: "🟡 待派发", color: "text-spark-flare" },
    in_progress: { label: "🔵 进行中", color: "text-spark-blue" },
    review: { label: "🟣 审稿中", color: "text-ai" },
    done: { label: "🟢 完成", color: "text-spark-mint" },
    cancelled: { label: "✕ 取消", color: "text-dim" },
    failed: { label: "❌ 失败", color: "text-fusion" },
  }[task.state];

  return (
    <Link
      to={`/business/c/${task.company_id}/tasks/${task.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <span className="text-[11px] text-muted shrink-0 w-16">{fmtTimeAgo(task.created_at)}</span>
      <span className="text-base shrink-0">{companyEmoji}</span>
      <span className="text-xs text-muted shrink-0 w-28 truncate">{companyName}</span>
      <span className="text-xs text-muted shrink-0 w-24 truncate font-mono">{task.dept_id}</span>
      <span className="text-sm text-body flex-1 truncate">{task.title}</span>
      <span className={`text-xs shrink-0 ${stateBadge.color}`}>{stateBadge.label}</span>
      {task.state === "in_progress" && (
        <span className="text-[10px] text-muted shrink-0 w-8 text-right">{Math.round(task.progress * 100)}%</span>
      )}
    </Link>
  );
}
