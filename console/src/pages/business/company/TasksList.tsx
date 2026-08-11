/**
 * /business/c/:companyId/tasks — left: compact task list; right: plan steps
 * with per-step outputs. Failed steps expose "solve in chat".
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Artifact, Company, DeptCatalogItem, Task, TaskState } from "../../../lib/api";
import { artifactRef, stepRef, taskRef } from "../../../lib/chatRefs";
import { resolveDeptDisplay } from "../../../lib/depts";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Segmented, type SegmentedOption } from "../../../components/ui/Segmented";
import { TaskStepOutputs } from "../../../components/ui/TaskStepOutputs";
import { useDeptChat } from "./ChatProvider";

type Ctx = { company: Company };
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
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const chat = useDeptChat();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedId = searchParams.get("task");
  const depts = chat.depts;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      if (!isPoll) setLoading(true);
      Promise.all([
        api.get<{ items: Task[] }>(`/v1/companies/${company.id}/tasks`),
        api.get<{ items: Artifact[] }>(`/v1/companies/${company.id}/artifacts`),
      ])
        .then(([tr, ar]) => {
          if (cancelled) return;
          setTasks(tr.items);
          setArtifacts(ar.items);
          if (tr.items.some((tk) => LIVE_STATES.has(tk.state))) {
            timer = setTimeout(() => load(true), POLL_MS);
          }
        })
        .catch((e) => {
          if (cancelled || isPoll) return;
          toast.error(apiErrorMessage(e, t("business.company.tasks.load-error")));
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
  }, [company.id, toast, t]);

  const artsByTask = useMemo(() => {
    const m = new Map<string, Artifact[]>();
    for (const a of artifacts) {
      const list = m.get(a.task_id) || [];
      list.push(a);
      m.set(a.task_id, list);
    }
    return m;
  }, [artifacts]);

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
      const deptLabel = resolveDeptDisplay(tk.dept_id, depts).label;
      return `${tk.title} ${tk.brief} ${deptLabel} ${tk.dept_id}`.toLowerCase().includes(q);
    });
  }, [tasks, query, stateFilter, depts]);

  const deleteTask = async (task: Task) => {
    if (deletingId) return;
    if (!window.confirm(t("task.delete.confirm", { title: task.title }))) return;
    setDeletingId(task.id);
    try {
      await api.delete(`/v1/companies/${company.id}/tasks/${task.id}`);
      setTasks((prev) => prev.filter((tk) => tk.id !== task.id));
      if (selectedId === task.id) {
        const next = new URLSearchParams(searchParams);
        next.delete("task");
        setSearchParams(next, { replace: true });
      }
      toast.success(t("task.delete.success"));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("task.delete.error")));
    } finally {
      setDeletingId(null);
    }
  };

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

  const solveInChat = (task: Task, stepKey?: string) => {
    const step = stepKey
      ? (task.plan || []).find((s) => s.key === stepKey)
      : (task.plan || []).find((s) => s.status === "failed");
    const refs = step
      ? [stepRef(task, step, t("business.company.chat.solve.step-detail"))]
      : [taskRef(task)];
    chat.bringToChat(task.dept_id, refs, {
      draft: t("business.company.chat.solve.draft", { title: task.title }),
    });
  };

  const selectedArts = selectedTask
    ? artsByTask.get(selectedTask.id) || []
    : [];

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">
            {t("business.company.tasks.title")}
          </h1>
          <p className="text-xs text-muted">{t("business.company.tasks.subtitle")}</p>
        </div>
        <Link
          to={`/business/c/${company.id}/tasks/new`}
          className="rounded-md border border-border-solid px-3 py-1.5 text-sm text-body hover:text-primary hover:border-primary transition"
        >
          {t("business.company.tasks.dispatch-new")}
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
            title={t("business.company.tasks.empty")}
            hint={t("business.company.tasks.empty-hint")}
            action={
              <Link
                to={`/business/c/${company.id}/chat`}
                className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
              >
                {t("business.company.tasks.empty-go-chat")}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-[36%] lg:max-w-md shrink-0 border-b lg:border-b-0 lg:border-e border-border-solid flex flex-col min-h-0 max-h-[40vh] lg:max-h-none">
            <div className="px-4 py-3 border-b border-border-solid flex flex-wrap items-center justify-between gap-3 shrink-0">
              <Segmented
                options={stateOptions}
                value={stateFilter}
                onChange={(v) => setStateFilter(v)}
              />
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t("business.company.tasks.search-placeholder")}
                className="w-full sm:w-40"
              />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon="🔍"
                    title={t("business.company.tasks.no-match")}
                    hint={t("common.filter-hint")}
                  />
                </div>
              ) : (
                <div className="divide-y divide-border-solid">
                  {filtered.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      companyId={company.id}
                      depts={depts}
                      artCount={(artsByTask.get(task.id) || []).length}
                      active={task.id === selectedTask?.id}
                      deleting={deletingId === task.id}
                      onSelect={() => selectTask(task.id)}
                      onDelete={() => void deleteTask(task)}
                      onDiscuss={() =>
                        chat.bringToChat(task.dept_id, [taskRef(task)])
                      }
                      onSolve={
                        task.state === "failed"
                          ? () => solveInChat(task)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border-solid flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest text-muted">
                  {t("business.company.tasks.pane.detail")}
                </div>
                <div className="text-sm text-heading truncate">
                  {selectedTask
                    ? selectedTask.title
                    : t("business.company.tasks.pane.pick-task")}
                </div>
                {selectedTask && (
                  <p className="text-xs text-muted mt-0.5 truncate">
                    {selectedTask.brief}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedTask?.state === "failed" && (
                  <button
                    type="button"
                    onClick={() => solveInChat(selectedTask)}
                    className="text-xs text-fusion hover:underline"
                  >
                    {t("business.company.chat.solve.action")}
                  </button>
                )}
                {selectedTask && (
                  <Link
                    to={`/business/c/${company.id}/tasks/${selectedTask.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("business.company.tasks.pane.open-detail")}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {selectedTask ? (
                <TaskStepOutputs
                  task={selectedTask}
                  artifacts={selectedArts}
                  owner={{ kind: "companies", id: company.id }}
                  onDiscuss={(art) =>
                    chat.bringToChat(selectedTask.dept_id, [
                      artifactRef(art, selectedTask.title),
                    ])
                  }
                  onSolveStep={(step) => solveInChat(selectedTask, step.key)}
                />
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon="👈"
                    title={t("business.company.tasks.pane.pick-task")}
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
  companyId,
  depts,
  artCount,
  active,
  deleting,
  onSelect,
  onDelete,
  onDiscuss,
  onSolve,
}: {
  task: Task;
  companyId: string;
  depts: DeptCatalogItem[];
  artCount: number;
  active: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDiscuss: () => void;
  onSolve?: () => void;
}) {
  const { t } = useTranslation();
  const meta = STATE_META[task.state];
  const plan = task.plan || [];
  const doneCount = plan.filter((s) => s.status === "done").length;
  const focus =
    plan.find((s) => s.status === "failed") ||
    plan.find((s) => s.status === "running");

  return (
    <div
      className={`block w-full text-start transition-colors border-s-2 ${
        active
          ? "border-primary bg-surface-2"
          : "border-transparent hover:bg-surface-2"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="block w-full px-4 pt-3 text-start"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-heading truncate">{task.title}</div>
            <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2">
              <span className={meta.color}>
                {meta.emoji} {t(`task.state.${task.state}`)}
              </span>
              <span>·</span>
              <span>{resolveDeptDisplay(task.dept_id, depts).label}</span>
              {plan.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {doneCount}/{plan.length}
                    {focus ? ` · ${focus.label || focus.key}` : ""}
                  </span>
                </>
              )}
              <span>·</span>
              <span>
                {t("business.company.tasks.pane.outputs-count", { count: artCount })}
              </span>
            </div>
          </div>
          {LIVE_STATES.has(task.state) && (
            <span className="text-xs text-muted shrink-0">
              {Math.round(task.progress * 100)}%
            </span>
          )}
        </div>
      </button>

      <div className="px-4 pb-3 pt-2 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={onDiscuss}
          className="text-primary hover:underline"
        >
          {t("business.company.chat.bring")}
        </button>
        {onSolve && (
          <button
            type="button"
            onClick={onSolve}
            className="text-fusion hover:underline"
          >
            {t("business.company.chat.solve.action")}
          </button>
        )}
        <Link
          to={`/business/c/${companyId}/tasks/${task.id}`}
          className="ms-auto text-muted hover:text-primary"
        >
          {t("business.company.tasks.pane.detail-link")}
        </Link>
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
          className="text-muted hover:text-fusion disabled:opacity-50"
        >
          {deleting ? "…" : t("task.delete.action")}
        </button>
      </div>
    </div>
  );
}
