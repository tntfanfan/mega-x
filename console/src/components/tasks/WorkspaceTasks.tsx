import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock3, Pause, Plus, Search, Square } from "lucide-react";
import { api, apiErrorMessage } from "../../lib/api";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { describeSchedule, formatTaskTime, mergeTaskEvents, outputTaskForContext, planSteps, preparationState, scheduleExecutionPolicy, taskDisplayState, taskIsLive, taskListState, type Run, type Schedule, type TaskEvent, type TaskRecord } from "../../lib/tasks";
import { usePoll } from "../../hooks/usePoll";
import { useTaskEvents } from "../../hooks/useTaskEvents";
import { useHorizontalSplit } from "../../hooks/useHorizontalSplit";
import { OutputsPane } from "../outputs/OutputsPane";
import { TaskCreateFlow } from "./TaskCreateFlow";
import { postTaskCommand, patchTaskCommand } from "../../lib/taskCommands";
import { TaskActivation } from "./TaskActivation";
import { defaultSchedule, ScheduleFields } from "./ScheduleFields";
import { ClarificationPanel, PlanReview, RunHistory, RunTimeline } from "./TaskPanels";
import { TaskActivity, TaskStatus, WorkingIndicator } from "./TaskActivity";
import { DeleteTaskButton } from "./DeleteTaskButton";

const button = "min-h-9 rounded-lg border border-border-solid px-3 py-2 text-sm text-body hover:border-primary disabled:opacity-50";
const primary = "min-h-9 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50";
const quiet = "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-surface-2 hover:text-heading disabled:opacity-50";
const active = (task: TaskRecord) => taskListState(task) === "running";

export function WorkspaceTasks({ scope, onCreate, className, showOutputs = true }: { scope: WorkspaceScope; onCreate?: () => void; className?: string; showOutputs?: boolean }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selected = params.get("task") || "";
  const [view, setView] = useState<"list" | "detail" | "create">(selected ? "detail" : "list");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TaskRecord[]>([]);
  const [detail, setDetail] = useState<TaskRecord | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobilePane, setMobilePane] = useState<"detail" | "outputs">("detail");
  const { containerRef, ratio, onPointerDown, onKeyDown } = useHorizontalSplit({ storageKey: "lgh.workspaceTasks.split", initialRatio: .56, minStart: 320, minEnd: 360 });
  const latest = useRef(`${scope.base}:${selected}`);
  latest.current = `${scope.base}:${selected}`;
  const currentScope = useRef(scope.base);
  currentScope.current = scope.base;
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const load = () => {
    const base = scope.base;
    const request = ++listRequest.current;
    api.get<{ items: TaskRecord[] }>(`${base}/tasks`).then(res => {
      if (currentScope.current === base && listRequest.current === request) { setItems(res.items || []); setError(""); }
    }).catch(e => { if (currentScope.current === base && listRequest.current === request) setError(apiErrorMessage(e, "加载失败，请重试")); })
      .finally(() => { if (currentScope.current === base && listRequest.current === request) setLoading(false); });
  };
  const loadDetail = () => {
    if (!selected) return;
    const key = `${scope.base}:${selected}`;
    const request = ++detailRequest.current;
    api.get<TaskRecord>(`${scope.base}/tasks/${selected}`).then(res => {
      if (latest.current === key && detailRequest.current === request) setDetail(res);
    }).catch(e => { if (latest.current === key && detailRequest.current === request) setError(apiErrorMessage(e, "加载失败，请重试")); });
  };
  usePoll(load, 5000, 30000, items.some(active), scope.base);
  usePoll(loadDetail, 5000, 30000, Boolean(selected) && Boolean(detail && (taskIsLive(taskDisplayState(detail)) || taskIsLive(preparationState(detail)) || detail.schedule?.enabled)), `${scope.base}:${selected}`);
  const connection = useTaskEvents(scope.base, detail?.runtime_owner === "container" ? selected : "", event => {
    if (event) setEvents(rows => mergeTaskEvents(rows, [event]));
    if (!refreshTimer.current) {
      const key = latest.current;
      refreshTimer.current = setTimeout(() => { refreshTimer.current = undefined; if (latest.current === key) { load(); loadDetail(); } }, 250);
    }
  }, detail?.event_cursor);
  useEffect(() => {
    setView(selected ? "detail" : "list"); setDetail(null); setEvents([]); setError("");
    if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = undefined; }
  }, [scope.base, selected]);
  useEffect(() => { setItems([]); setLoading(true); setQuery(""); }, [scope.base]);
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  useEffect(() => { if (params.has("kind")) { const next = new URLSearchParams(params); next.delete("kind"); setParams(next, { replace: true }); } }, [params, setParams]);
  const select = (task: TaskRecord) => { const next = new URLSearchParams(params); next.set("task", task.id); next.delete("kind"); next.delete("run"); setParams(next); setView("detail"); };
  const back = () => { const next = new URLSearchParams(params); next.delete("task"); next.delete("run"); setParams(next); setView("list"); };
  const create = () => { if (onCreate) onCreate(); else setView("create"); };
  const openFile = (path: string) => { const next = new URLSearchParams(params); next.set("file", path); setParams(next); };
  const deleted = (id: string) => {
    ++listRequest.current; ++detailRequest.current;
    setItems(rows => rows.filter(task => task.id !== id));
    if (selected === id) {
      setDetail(null); setEvents([]); setView("list");
      const next = new URLSearchParams(params); next.delete("task"); next.delete("run");
      if (next.get("file")?.startsWith(`tasks/${id}/`)) next.delete("file");
      setParams(next);
    }
    load();
  };
  const search = query.trim().toLocaleLowerCase();
  const filtered = items.filter(task => `${task.title} ${task.goal || task.brief || ""}`.toLocaleLowerCase().includes(search));
  const left = <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {view !== "create" && <header className="flex shrink-0 items-center gap-3 border-b border-border-solid px-5 py-3">
      {view === "detail" ? <button type="button" onClick={back} className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-heading"><ArrowLeft size={15} aria-hidden />任务</button> : <h2 className="text-base font-medium text-heading">任务</h2>}
      <button type="button" onClick={create} className="ms-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-bg"><Plus size={15} aria-hidden />新建</button>
    </header>}
    {connection === "reconnecting" && view === "detail" && <p role="status" className="px-5 py-2 text-xs text-muted">重连中…</p>}
    {error && <p role="alert" className="px-5 py-2 text-sm text-fusion">{error}</p>}
    <div className="min-h-0 flex-1 overflow-auto">
      {view === "create" ? <TaskCreateFlow key={scope.base} scope={scope} leadDeptId={scope.kind === "sandbox" ? scope.id : undefined} onCancel={back} onCreated={id => { select({ id } as TaskRecord); load(); }} />
        : view === "detail" && selected ? <div className="p-5">{detail ? <TaskDetail key={`${scope.base}:${detail.id}`} scope={scope} task={detail} events={events} onChange={() => { loadDetail(); load(); }} onDeleted={deleted} onOpenFile={openFile} initialRunId={params.get("run") || ""} /> : <WorkingIndicator label="加载任务" />}</div>
          : <div className="p-5">
            <div className="relative mb-4"><Search size={15} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" aria-label="搜索任务" placeholder="搜索任务" value={query} onChange={e => setQuery(e.target.value)} className="min-h-10 w-full rounded-lg border border-border-solid bg-surface/40 py-2 pe-3 ps-9 text-sm focus:border-primary/60" /></div>
            {loading ? <WorkingIndicator label="加载任务" /> : items.length === 0 ? <p className="py-8 text-center text-sm text-muted">暂无任务</p> : filtered.length === 0 ? <p className="py-8 text-center text-sm text-muted">没有找到任务</p> : <ul className="divide-y divide-border-solid">{filtered.map(task => <li key={task.id} className="flex min-w-0 items-center gap-1 py-1">
              <button type="button" onClick={() => select(task)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 text-start hover:bg-surface-2"><span className="min-w-0 flex-1 break-words text-sm text-heading">{task.title}</span><TaskStatus task={task} /></button>
              <DeleteTaskButton base={scope.base} task={task} onDeleted={deleted} />
            </li>)}</ul>}
          </div>}
    </div>
  </div>;
  if (!showOutputs) return <div className={`${className || "h-full"} flex min-h-0 min-w-0 flex-col`}>{left}</div>;
  return <div className={`${className || "h-[calc(100vh-8rem-72px)]"} flex min-h-0 min-w-0 flex-col`}>
    <div className="flex shrink-0 gap-3 border-b border-border-solid px-4 py-2 xl:hidden"><button type="button" aria-pressed={mobilePane === "detail"} onClick={() => setMobilePane("detail")} className="text-sm text-primary">任务</button><button type="button" aria-pressed={mobilePane === "outputs"} onClick={() => setMobilePane("outputs")} className="text-sm text-primary">{t("outputs.title")}</button></div>
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1" style={{ "--task-split": `${ratio * 100}%` } as CSSProperties}>
      <div className={`${mobilePane === "outputs" ? "hidden xl:flex" : "flex"} workspace-task-detail min-h-0 min-w-0 flex-col`}>{left}</div>
      <div role="separator" aria-orientation="vertical" aria-label={t("workspace.tasks.resize")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} tabIndex={0} onPointerDown={onPointerDown} onKeyDown={onKeyDown} className="hidden w-2 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/10 xl:flex"><span className="h-10 w-0.5 bg-border-solid" /></div>
      <div className={`${mobilePane === "detail" ? "hidden xl:flex" : "flex"} min-h-0 min-w-0 flex-1`}><OutputsPane scope={scope} taskId={outputTaskForContext(params.get("file"), selected || undefined)} className="flex-1" /></div>
    </div>
  </div>;
}

function TaskDetail({ scope, task, events, onChange, onDeleted, onOpenFile, initialRunId }: { scope: WorkspaceScope; task: TaskRecord; events: TaskEvent[]; onChange: () => void; onDeleted: (id: string) => void; onOpenFile: (path: string) => void; initialRunId: string }) {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [historyId, setHistoryId] = useState(initialRunId);
  const [history, setHistory] = useState<Run | null>(null);
  const [guidance, setGuidance] = useState("");
  const [editing, setEditing] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>(task.schedule?.mode === "scheduled" || task.schedule?.type ? task.schedule : defaultSchedule);
  const [validSchedule, setValidSchedule] = useState(false);
  useEffect(() => { setHistoryId(initialRunId); }, [initialRunId]);
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    if (historyId) api.get<Run>(`${scope.base}/tasks/${task.id}/runs/${historyId}`).then(run => { if (!cancelled) setHistory(run); }).catch(e => { if (!cancelled) setError(apiErrorMessage(e, "加载记录失败")); });
    return () => { cancelled = true; };
  }, [scope.base, task.id, historyId]);
  const action = async (work: () => Promise<unknown>) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { await work(); onChange(); }
    catch (e) { setError(apiErrorMessage(e, "操作失败，请重试")); }
    finally { submitting.current = false; setBusy(false); }
  };
  const base = `${scope.base}/tasks/${task.id}`;
  const current = task.current_run || task.run;
  const run = historyId ? history : current;
  const preparation = preparationState(task);
  const preparing = ["clarifying", "planning"].includes(preparation);
  const visiblePlan = historyId && run?.task_snapshot?.plan ? run.task_snapshot.plan.steps || [] : planSteps(task);
  const blocked = ["queued", "running", "verifying", "paused", "interrupted", "waiting_input"].includes(current?.state || task.last_run?.state || "");
  const ready = task.state !== "archived" && Boolean(task.active_plan_version || task.plan_doc?.confirmed_at) && preparation !== "schedule_setup";
  const goal = (task.goal || task.brief || "").trim();
  const actions = preparing ? <button type="button" disabled={busy} className={quiet} onClick={() => void action(() => postTaskCommand(`${base}/preparation/cancel`, {}))}><Square size={12} aria-hidden />停止</button>
    : current ? <><button type="button" disabled={busy || current.control?.pause_requested} className={quiet} onClick={() => void action(() => postTaskCommand(`${base}/runs/${current.id}/pause`, {}))}><Pause size={12} aria-hidden />{current.control?.pause_requested ? "暂停中" : "暂停"}</button><button type="button" disabled={busy || current.control?.cancel_requested} className={quiet} onClick={() => void action(() => postTaskCommand(`${base}/runs/${current.id}/cancel`, {}))}><Square size={12} aria-hidden />{current.control?.cancel_requested ? "停止中" : "停止"}</button></> : undefined;
  return <div className="space-y-5 text-sm">
    <div className="flex items-start gap-3"><h2 className="min-w-0 flex-1 break-words text-lg font-medium leading-relaxed text-heading">{task.title}</h2><div className="flex shrink-0 items-center gap-1 pt-0.5"><TaskStatus task={task} /><DeleteTaskButton base={scope.base} task={task} onDeleted={onDeleted} /></div></div>
    {goal && goal !== task.title.trim() && <details className="text-muted"><summary className="cursor-pointer text-xs">任务目标</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed text-body">{goal}</p></details>}
    {task.runtime_available === false && <p role="status" className="text-xs text-muted">等待运行环境恢复…</p>}
    {task.wait_reason && <p className="text-fusion">{task.wait_reason}</p>}
    {error && <p role="alert" className="text-fusion">{error}</p>}
    {!historyId && <TaskActivity task={task} events={events} actions={actions} />}
    {preparation === "draft" && <button type="button" disabled={busy} className={primary} onClick={() => void action(() => postTaskCommand(`${base}/preparation/retry`, {}))}>继续</button>}
    {preparation === "awaiting_input" && <ClarificationPanel key={task.clarify?.current_batch_id || task.id} scope={scope} task={task} busy={busy} action={action} />}
    {preparation === "plan_review" && <PlanReview key={`${task.id}:v${task.plan_doc?.version}`} scope={scope} task={task} busy={busy} action={action} />}
    {preparation === "schedule_setup" && <TaskActivation key={`${task.id}:v${task.active_plan_version}`} scope={scope} task={task} busy={busy} action={action} />}
    {current?.state === "queued" && (task.queue?.ahead || 0) > 0 && <p className="text-xs text-muted">前面还有 {task.queue!.ahead} 个任务</p>}
    {current && ["failed", "paused", "waiting_input", "interrupted"].includes(current.state) && <section className="space-y-3">
      <label className="block text-muted">{current.state === "waiting_input" ? "补充信息" : "补充要求（可选）"}<textarea rows={2} value={guidance} onChange={e => setGuidance(e.target.value)} className="mt-2 w-full rounded-lg border border-border-solid bg-surface px-3 py-2" /></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || current.state === "waiting_input" && !guidance.trim()} className={primary} onClick={() => void action(() => postTaskCommand(`${base}/runs/${current.id}/resume`, { guidance }))}>继续执行</button>{current.state !== "failed" && <button type="button" disabled={busy} className={quiet} onClick={() => void action(() => postTaskCommand(`${base}/runs/${current.id}/cancel`, {}))}>停止</button>}</div>
    </section>}
    {run && <RunTimeline run={{ ...run, events: mergeTaskEvents(run.events, task.events?.filter(event => event.run_id === run.id), events.filter(event => event.run_id === run.id)) }} onOpenFile={onOpenFile} />}
    {historyId && <button type="button" className={quiet} onClick={() => setHistoryId("")}>返回当前执行</button>}
    {ready && <section className="space-y-3 border-t border-border-solid pt-4">
      {task.schedule?.mode === "scheduled" && <p className="flex items-center gap-2 text-xs text-muted"><Clock3 size={13} aria-hidden />{describeSchedule(task.schedule)}{task.schedule.enabled ? ` · 下次 ${formatTaskTime(task.schedule.next_run_at, task.schedule.tz)}` : " · 已暂停"}</p>}
      {task.schedule?.block_reason && <p className="text-xs text-fusion">定时已暂停，请检查执行记录</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || blocked} className={primary} onClick={() => void action(() => postTaskCommand(`${base}/runs`, {}))}>{current ? "重新执行" : "执行"}</button><button type="button" disabled={busy} className={button} onClick={() => { setSchedule(task.schedule?.type ? task.schedule : defaultSchedule); setEditing(!editing); }}>定时</button>{task.schedule?.mode !== "immediate" && task.schedule && <button type="button" disabled={busy} className={quiet} onClick={() => void action(() => patchTaskCommand(`${base}/schedule`, { enabled: !task.schedule?.enabled, revision: task.revision, schedule_revision: task.schedule?.revision }))}>{task.schedule.enabled ? "暂停定时" : "开启定时"}</button>}</div>
      {editing && <div className="space-y-3 rounded-lg border border-border-solid p-4"><ScheduleFields base={scope.base} value={schedule} onChange={setSchedule} onValidity={setValidSchedule} /><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={schedule.enabled ?? task.schedule?.enabled ?? false} onChange={e => setSchedule(value => ({ ...value, enabled: e.target.checked }))} />开启定时</label><div className="flex gap-2"><button type="button" disabled={busy || !validSchedule} className={primary} onClick={() => void action(async () => { await patchTaskCommand(`${base}/schedule`, { schedule: { ...schedule, mode: "scheduled", enabled: schedule.enabled ?? task.schedule?.enabled ?? false, ...scheduleExecutionPolicy }, revision: task.revision, schedule_revision: task.schedule?.revision }); setEditing(false); })}>保存</button><button type="button" className={quiet} onClick={() => setEditing(false)}>取消</button></div></div>}
    </section>}
    {preparation === "failed" && <button type="button" disabled={busy} className={primary} onClick={() => void action(() => postTaskCommand(`${base}/preparation/retry`, {}))}>重试</button>}
    {!["plan_review", "planning", "clarifying", "awaiting_input"].includes(preparation) && visiblePlan.length > 0 && <details className="border-t border-border-solid pt-3 text-muted"><summary className="min-h-8 cursor-pointer text-xs">计划 · {visiblePlan.length} 步</summary><ol className="mt-2 space-y-3">{visiblePlan.map((step, i) => <li key={step.key}><p className="text-body">{i + 1}. {step.title}</p><p className="mt-1 text-xs leading-relaxed">{step.instructions}</p>{step.acceptance && <p className="mt-1 text-xs">验收：{step.acceptance}</p>}</li>)}</ol>{(ready || preparation === "schedule_setup") && <button type="button" disabled={busy} className={`${quiet} mt-3`} onClick={() => void action(() => postTaskCommand(`${base}/plan/regenerate`, { feedback: "检查并调整执行计划，生成待确认的新版本" }))}>修改计划</button>}</details>}
    {(task.runs || []).length > 0 && <details className="text-muted"><summary className="min-h-8 cursor-pointer text-xs">执行历史</summary><RunHistory task={task} selected={historyId} onSelect={setHistoryId} /></details>}
  </div>;
}
