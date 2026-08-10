/**
 * /solo/overview — Solo global overview.
 *
 * Same logic as business Overview: real lines + cross-line task feed + KPI bar.
 * Solo extras: today's artifacts strip. No mock footer / fake revenue grid.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../lib/api";
import type { Company, ActivityEvent, Task, TaskState, Artifact } from "../../lib/api";
import { PortfolioTile } from "../../components/solo/PortfolioTile";

const TASK_STATE_META: Record<TaskState, { emoji: string; color: string }> = {
  pending: { emoji: "🟡", color: "text-spark-flare" },
  in_progress: { emoji: "🔵", color: "text-spark-blue" },
  review: { emoji: "🟣", color: "text-ai" },
  done: { emoji: "🟢", color: "text-spark-mint" },
  cancelled: { emoji: "✕", color: "text-dim" },
  failed: { emoji: "❌", color: "text-fusion" },
};

interface OverviewData {
  lines: Company[];
  activity: ActivityEvent[];
  tasks: Task[];
  todayArtifacts: Artifact[];
  loading: boolean;
  error: string | null;
}

function useOverview(): OverviewData {
  const [data, setData] = useState<OverviewData>({
    lines: [],
    activity: [],
    tasks: [],
    todayArtifacts: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ items: Company[] }>("/v1/lines"),
      api.get<{ items: ActivityEvent[] }>("/v1/activity"),
    ])
      .then(async ([ls, acts]) => {
        const lineIds = new Set(ls.items.map((l) => l.id));
        const taskLists = await Promise.all(
          ls.items.map((line) =>
            api
              .get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`)
              .then((r) => r.items)
              .catch(() => [] as Task[]),
          ),
        );
        const artifactLists = await Promise.all(
          ls.items.map((line) =>
            api
              .get<{ items: Artifact[] }>(`/v1/lines/${line.id}/artifacts`)
              .then((r) => r.items)
              .catch(() => [] as Artifact[]),
          ),
        );
        if (cancelled) return;
        const tasks = taskLists.flat();
        const todayArts = artifactLists
          .flat()
          .filter((a) => Date.now() - new Date(a.created_at).getTime() < 24 * 60 * 60 * 1000)
          .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
          .slice(0, 8);
        setData({
          lines: ls.items,
          activity: acts.items.filter((a) => lineIds.has(a.company_id)),
          tasks,
          todayArtifacts: todayArts,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setData({
            lines: [],
            activity: [],
            tasks: [],
            todayArtifacts: [],
            loading: false,
            error: String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtTimeAgo(iso: string, locale: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return rtf.format(-days, "day");
}

export default function SoloOverview() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { lines, activity, tasks, todayArtifacts, loading, error } = useOverview();

  const kpis = useMemo(() => {
    const totalTeams = lines.reduce((sum, l) => sum + l.dept_ids.length, 0);
    const activeTasks = tasks.filter((tk) => tk.state === "in_progress" || tk.state === "review").length;
    const token30d = lines.reduce((sum, l) => sum + l.token_usage_30d, 0);
    return {
      lines: lines.length,
      teams: totalTeams,
      tasks: activeTasks,
      token30d,
    };
  }, [lines, tasks]);

  if (loading) {
    return (
      <section className="container py-10">
        <p className="text-body text-sm">{t("common.loading")}…</p>
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
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 for Solo</p>
          <h1 className="font-display text-3xl text-heading">{t("solo.overview.title")}</h1>
          <p className="text-sm text-muted">{t("solo.overview.subtitle")}</p>
        </div>
        <Link
          to="/solo/lines/new"
          className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("solo.overview.lines.create")}
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t("solo.overview.kpi.lines-count")} value={String(kpis.lines)} />
        <Kpi label={t("solo.overview.kpi.teams")} value={String(kpis.teams)} />
        <Kpi label={t("solo.overview.kpi.tasks")} value={String(kpis.tasks)} />
        <Kpi label={t("solo.overview.kpi.token-30d")} value={fmtNumber(kpis.token30d)} />
      </div>

      {lines.length === 0 ? (
        <EmptyLines />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              locale={locale}
              activity={activity.filter((a) => a.company_id === line.id).slice(0, 3)}
            />
          ))}
          <CreateLineCard />
        </div>
      )}

      <section>
        <h2 className="font-display text-xl text-heading mb-3">
          {t("solo.overview.cross-task-feed.title")}
        </h2>
        <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
          {tasks.length === 0 ? (
            <p className="p-4 text-muted text-sm">{t("solo.overview.cross-task-feed.empty")}</p>
          ) : (
            tasks
              .slice()
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
              .slice(0, 12)
              .map((task) => {
                const line = lines.find((l) => l.id === task.company_id);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    locale={locale}
                    lineName={line?.name ?? task.company_id}
                    lineEmoji={line?.emoji ?? "🚀"}
                  />
                );
              })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-xl text-heading">{t("solo.overview.outputs.title")}</h2>
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

function LineCard({
  line,
  activity,
  locale,
}: {
  line: Company;
  activity: ActivityEvent[];
  locale: string;
}) {
  const { t } = useTranslation();
  const stateLabel = t(`solo.overview.lines.state.${line.state}`);

  return (
    <Link
      to={`/solo/l/${line.id}/`}
      className="group rounded-md border border-border-solid bg-surface p-5 hover:border-primary transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{line.emoji}</span>
          <div>
            <h3 className="font-display text-lg text-heading group-hover:text-primary">{line.name}</h3>
            <p className="text-[11px] text-muted">{line.template_slug}</p>
          </div>
        </div>
        <span className="text-[10px] text-muted">{stateLabel}</span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-body">
        <span>
          {line.dept_ids.length}
          {t("solo.overview.lines.teams-suffix")}
        </span>
        <span className="text-dim">·</span>
        <span>
          {line.active_tasks > 0
            ? t("solo.overview.lines.active-tasks", { count: line.active_tasks })
            : t("solo.overview.lines.tasks-zero")}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-border-solid space-y-1">
        <div className="text-[10px] tracking-widest uppercase text-muted">
          {t("solo.overview.lines.last-event")}
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-dim">
            {line.last_activity_text || t("solo.overview.lines.no-recent")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {activity.map((a) => (
              <li key={a.id} className="text-xs text-body truncate">
                <span className="text-muted text-[10px]">{fmtTimeAgo(a.ts, locale)} · </span>
                {a.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
        <span>
          {t("solo.overview.lines.token-30d", { tokens: fmtNumber(line.token_usage_30d) })}
        </span>
        <span className="text-primary group-hover:underline">{t("solo.overview.lines.enter")}</span>
      </div>
    </Link>
  );
}

function CreateLineCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/solo/lines/new"
      className="rounded-md border border-dashed border-border-solid bg-surface/40 p-5 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-surface/80 transition-colors min-h-[200px]"
    >
      <div className="text-4xl text-primary opacity-70">＋</div>
      <h3 className="font-display text-lg text-heading mt-2">{t("solo.overview.create-card")}</h3>
      <p className="text-xs text-muted mt-1">{t("solo.overview.create-card.subtitle")}</p>
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
        {t("solo.overview.empty.cta")}
      </Link>
    </div>
  );
}

function TaskRow({
  task,
  lineName,
  lineEmoji,
  locale,
}: {
  task: Task;
  lineName: string;
  lineEmoji: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const meta = TASK_STATE_META[task.state];

  return (
    <Link
      to={`/solo/l/${task.company_id}/tasks/${task.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <span className="text-[11px] text-muted shrink-0 w-16">{fmtTimeAgo(task.created_at, locale)}</span>
      <span className="text-base shrink-0">{lineEmoji}</span>
      <span className="text-xs text-muted shrink-0 w-28 truncate">{lineName}</span>
      <span className="text-xs text-muted shrink-0 w-24 truncate font-mono">{task.dept_id}</span>
      <span className="text-sm text-body flex-1 truncate">{task.title}</span>
      <span className={`text-xs shrink-0 ${meta.color}`}>
        {meta.emoji} {t(`task.state.${task.state}`)}
      </span>
      {task.state === "in_progress" && (
        <span className="text-[10px] text-muted shrink-0 w-8 text-end">
          {Math.round(task.progress * 100)}%
        </span>
      )}
    </Link>
  );
}
