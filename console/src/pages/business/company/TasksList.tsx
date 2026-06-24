/**
 * /business/c/:companyId/tasks — Tasks in this company.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, TaskState } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Segmented, type SegmentedOption } from "../../../components/ui/Segmented";

type Ctx = { company: Company };
type StateFilter = TaskState | "all";

const STATE_ORDER: TaskState[] = ["pending", "in_progress", "review", "done", "cancelled", "failed"];
// Emoji + color stay in code; the wording comes from i18n (task.state.*).
const STATE_META: Record<TaskState, { emoji: string; color: string }> = {
  pending: { emoji: "🟡", color: "text-spark-flare" },
  in_progress: { emoji: "🔵", color: "text-spark-blue" },
  review: { emoji: "🟣", color: "text-ai" },
  done: { emoji: "🟢", color: "text-spark-mint" },
  cancelled: { emoji: "✕", color: "text-dim" },
  failed: { emoji: "❌", color: "text-fusion" },
};

export default function TasksList() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Task[] }>(`/v1/companies/${company.id}/tasks`)
      .then((r) => { if (!cancelled) setTasks(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.company.tasks.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id, toast, t]);

  const stateOptions = useMemo<SegmentedOption<StateFilter>[]>(() => {
    const counts = tasks.reduce<Record<string, number>>((m, tk) => {
      m[tk.state] = (m[tk.state] ?? 0) + 1;
      return m;
    }, {});
    return [
      { value: "all", label: t("task.state.all"), count: tasks.length },
      ...STATE_ORDER.filter((s) => counts[s]).map((s) => ({
        value: s as StateFilter, label: t(`task.state.${s}`), count: counts[s],
      })),
    ];
  }, [tasks, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((tk) => {
      if (stateFilter !== "all" && tk.state !== stateFilter) return false;
      if (!q) return true;
      return `${tk.title} ${tk.brief} ${tk.dept_id}`.toLowerCase().includes(q);
    });
  }, [tasks, query, stateFilter]);

  return (
    <section className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-heading">{t("business.company.tasks.title")}</h1>
        </div>
        <Link
          to={`/business/c/${company.id}/tasks/new`}
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
        >
          {t("business.company.tasks.dispatch-new")}
        </Link>
      </header>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="⚡"
          title={t("business.company.tasks.empty")}
          action={
            <Link
              to={`/business/c/${company.id}/tasks/new`}
              className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
            >
              {t("business.company.tasks.dispatch-new")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented options={stateOptions} value={stateFilter} onChange={(v) => setStateFilter(v)} />
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("business.company.tasks.search-placeholder")}
              className="w-full sm:w-64"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="🔍" title={t("business.company.tasks.no-match")} hint={t("common.filter-hint")} />
          ) : (
            <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
              {filtered.map((task) => <TaskRow key={task.id} task={task} companyId={company.id} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TaskRow({ task, companyId }: { task: Task; companyId: string }) {
  const { t } = useTranslation();
  const meta = STATE_META[task.state];

  return (
    <Link
      to={`/business/c/${companyId}/tasks/${task.id}`}
      className="block px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-heading">{task.title}</div>
          <div className="text-[11px] text-muted mt-0.5 truncate">{task.brief}</div>
        </div>
        <span className={`text-xs ${meta.color} shrink-0`}>{meta.emoji} {t(`task.state.${task.state}`)}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="font-mono">{task.dept_id}</span>
        {task.state === "in_progress" && (
          <>
            <span>·</span>
            <span>{Math.round(task.progress * 100)}%</span>
            <span className="flex-1 max-w-32 h-1 rounded bg-surface-3 overflow-hidden">
              <span className="block h-full bg-primary" style={{ width: `${task.progress * 100}%` }} />
            </span>
          </>
        )}
        <span className="ms-auto">{task.expected_artifacts.join(" · ")}</span>
      </div>
    </Link>
  );
}
