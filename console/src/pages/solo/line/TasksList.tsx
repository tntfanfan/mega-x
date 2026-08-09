/**
 * /solo/l/:lineId/tasks — left: task list, right: that task's outputs.
 *
 * Mirrors business/company/TasksList; paths use /v1/lines/:id/*.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, TaskState } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Segmented, type SegmentedOption } from "../../../components/ui/Segmented";
import { ArtifactGallery } from "../../business/company/ArtifactGallery";

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

const LIVE_STATES = new Set<TaskState>(["pending", "in_progress"]);
const POLL_MS = 3000;

export default function TasksList() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const selectedId = searchParams.get("task");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      if (!isPoll) setLoading(true);
      api
        .get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`)
        .then((r) => {
          if (cancelled) return;
          setTasks(r.items);
          if (r.items.some((tk) => LIVE_STATES.has(tk.state))) {
            timer = setTimeout(() => load(true), POLL_MS);
          }
        })
        .catch((e) => {
          if (cancelled || isPoll) return;
          toast.error(apiErrorMessage(e, t("solo.line.tasks.load-error")));
        })
        .finally(() => {
          if (!cancelled && !isPoll) setLoading(false);
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        load(true);
      }
    };

    load(false);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [line.id, toast, t]);

  const stateOptions = useMemo<SegmentedOption<StateFilter>[]>(() => {
    const counts = tasks.reduce<Record<string, number>>((m, tk) => {
      m[tk.state] = (m[tk.state] ?? 0) + 1;
      return m;
    }, {});
    return [
      { value: "all", label: t("task.state.all"), count: tasks.length },
      ...STATE_ORDER.filter((s) => counts[s]).map((s) => ({
        value: s as StateFilter,
        label: t(`task.state.${s}`),
        count: counts[s],
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

  const selectedTask = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((tk) => tk.id === selectedId) ?? filtered[0];
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedTask) {
      if (searchParams.has("task") || searchParams.has("view")) {
        const next = new URLSearchParams(searchParams);
        next.delete("task");
        next.delete("view");
        setSearchParams(next, { replace: true });
      }
      return;
    }
    if (selectedId === selectedTask.id && !searchParams.has("view")) return;
    const next = new URLSearchParams(searchParams);
    next.set("task", selectedTask.id);
    next.delete("view");
    setSearchParams(next, { replace: true });
  }, [selectedTask, selectedId, searchParams, setSearchParams]);

  const selectTask = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("task", id);
    next.delete("view");
    setSearchParams(next, { replace: true });
  };

  const selectedLive = selectedTask ? LIVE_STATES.has(selectedTask.state) : false;

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">
            {t("solo.line.tasks.title")}
          </h1>
          <p className="text-xs text-muted">{t("solo.line.tasks.subtitle")}</p>
        </div>
        <Link
          to={`/solo/l/${line.id}/tasks/new`}
          className="rounded-md border border-border-solid px-3 py-1.5 text-sm text-body hover:text-primary hover:border-primary transition"
        >
          {t("solo.line.tasks.dispatch-new")}
        </Link>
      </header>

      {loading ? (
        <div className="p-4">
          <ListSkeleton rows={4} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon="⚡"
            title={t("solo.line.tasks.empty")}
            hint={t("solo.line.tasks.empty-hint")}
            action={
              <Link
                to={`/solo/l/${line.id}/chat`}
                className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
              >
                {t("solo.line.tasks.empty-go-chat")}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-[42%] lg:max-w-xl shrink-0 border-b lg:border-b-0 lg:border-e border-border-solid flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
            <div className="px-4 py-3 border-b border-border-solid flex flex-wrap items-center justify-between gap-3 shrink-0">
              <Segmented
                options={stateOptions}
                value={stateFilter}
                onChange={(v) => setStateFilter(v)}
              />
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t("solo.line.tasks.search-placeholder")}
                className="w-full sm:w-44"
              />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon="🔍"
                    title={t("solo.line.tasks.no-match")}
                    hint={t("common.filter-hint")}
                  />
                </div>
              ) : (
                <div className="divide-y divide-border-solid">
                  {filtered.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      lineId={line.id}
                      active={task.id === selectedTask?.id}
                      onSelect={() => selectTask(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border-solid flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted">
                  {t("solo.line.tasks.pane.outputs")}
                </div>
                <div className="text-sm text-heading truncate">
                  {selectedTask
                    ? selectedTask.title
                    : t("solo.line.tasks.pane.pick-task")}
                </div>
              </div>
              {selectedTask && (
                <Link
                  to={`/solo/l/${line.id}/tasks/${selectedTask.id}`}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  {t("solo.line.tasks.pane.open-detail")}
                </Link>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {selectedTask ? (
                <ArtifactGallery
                  owner={{ kind: "lines", id: line.id }}
                  taskId={selectedTask.id}
                  taskBasePath={`/solo/l/${line.id}/tasks`}
                  emptyTitle={
                    selectedLive
                      ? t("solo.line.tasks.pane.waiting-outputs")
                      : t("solo.line.tasks.pane.no-outputs")
                  }
                  emptyHint={
                    selectedLive
                      ? t("solo.line.tasks.detail.waiting-artifacts")
                      : undefined
                  }
                  pollMs={selectedLive ? POLL_MS : undefined}
                  loadErrorKey="solo.line.portfolio.load-error"
                  taskLinkKey="solo.line.portfolio.task-link"
                />
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon="👈"
                    title={t("solo.line.tasks.pane.pick-task")}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  lineId,
  active,
  onSelect,
}: {
  task: Task;
  lineId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const meta = STATE_META[task.state];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`block w-full text-start px-4 py-3 transition-colors cursor-pointer border-s-2 ${
        active
          ? "border-primary bg-surface-2"
          : "border-transparent hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-heading">{task.title}</div>
          <div className="text-[11px] text-muted mt-0.5 truncate">{task.brief}</div>
        </div>
        <span className={`text-xs ${meta.color} shrink-0`}>
          {meta.emoji} {t(`task.state.${task.state}`)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="font-mono">{task.dept_id}</span>
        {task.source === "chat" && (
          <>
            <span>·</span>
            <span>{t("solo.line.tasks.detail.source-chat")}</span>
          </>
        )}
        {task.state === "in_progress" && (
          <>
            <span>·</span>
            <span>{Math.round(task.progress * 100)}%</span>
            <span className="flex-1 max-w-32 h-1 rounded bg-surface-3 overflow-hidden">
              <span
                className="block h-full bg-primary"
                style={{ width: `${task.progress * 100}%` }}
              />
            </span>
          </>
        )}
        <Link
          to={`/solo/l/${lineId}/tasks/${task.id}`}
          onClick={(e) => e.stopPropagation()}
          className="ms-auto text-primary hover:underline shrink-0"
        >
          {t("solo.line.tasks.pane.detail-link")}
        </Link>
      </div>
    </div>
  );
}
