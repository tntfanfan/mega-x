/**
 * /solo/l/:lineId/tasks — 任务 + 对话（左右分栏）。
 *
 * 与企业版 TasksList 同构；路径走 /v1/lines/:id/*。
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
import { ChatPanel } from "./Conversations";

type Ctx = { line: Company };
type StateFilter = TaskState | "all";

const STATE_ORDER: TaskState[] = ["pending", "in_progress", "review", "done", "cancelled", "failed"];
const STATE_META: Record<TaskState, { emoji: string; color: string }> = {
  pending: { emoji: "🟡", color: "text-spark-flare" },
  in_progress: { emoji: "🔵", color: "text-spark-blue" },
  review: { emoji: "🟣", color: "text-ai" },
  done: { emoji: "🟢", color: "text-spark-mint" },
  cancelled: { emoji: "✕", color: "text-dim" },
  failed: { emoji: "❌", color: "text-fusion" },
};

export default function TasksList() {
  const { line } = useOutletContext<Ctx>();
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
      .get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`)
      .then((r) => { if (!cancelled) setTasks(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("solo.line.tasks.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [line.id, toast, t]);

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
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">{t("solo.line.tasks.title")}</h1>
          <p className="text-xs text-muted">{t("solo.line.tasks.subtitle")}</p>
        </div>
        <Link
          to={`/solo/l/${line.id}/tasks/new`}
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
        >
          {t("solo.line.tasks.dispatch-new")}
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col border-e border-border-solid">
          {loading ? (
            <div className="p-4"><ListSkeleton rows={4} /></div>
          ) : tasks.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon="⚡"
                title={t("solo.line.tasks.empty")}
                action={
                  <Link
                    to={`/solo/l/${line.id}/tasks/new`}
                    className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
                  >
                    {t("solo.line.tasks.dispatch-new")}
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border-solid flex flex-wrap items-center justify-between gap-3 shrink-0">
                <Segmented options={stateOptions} value={stateFilter} onChange={(v) => setStateFilter(v)} />
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={t("solo.line.tasks.search-placeholder")}
                  className="w-full sm:w-56"
                />
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {filtered.length === 0 ? (
                  <div className="p-4">
                    <EmptyState icon="🔍" title={t("solo.line.tasks.no-match")} hint={t("common.filter-hint")} />
                  </div>
                ) : (
                  <div className="divide-y divide-border-solid">
                    {filtered.map((task) => (
                      <TaskRow key={task.id} task={task} lineId={line.id} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="w-full max-w-md shrink-0 flex flex-col min-h-0 bg-surface/40">
          <ChatPanel line={line} />
        </aside>
      </div>
    </div>
  );
}

function TaskRow({ task, lineId }: { task: Task; lineId: string }) {
  const { t } = useTranslation();
  const meta = STATE_META[task.state];

  return (
    <Link
      to={`/solo/l/${lineId}/tasks/${task.id}`}
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
        <span className="ms-auto truncate max-w-[40%]">{task.expected_artifacts.join(" · ")}</span>
      </div>
    </Link>
  );
}
