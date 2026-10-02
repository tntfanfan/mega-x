import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Clock3, LoaderCircle } from "lucide-react";
import { mergeTaskEvents, preparationState, taskListState, taskScheduleLabel, taskStatusLabel, type TaskEvent, type TaskRecord } from "../../lib/tasks";

export function TaskStatus({ task }: { task: TaskRecord }) {
  const state = taskListState(task);
  const label = taskStatusLabel(task);
  return <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs ${state === "running" ? "text-primary" : state === "done" ? "text-primary/80" : "text-muted"}`}>
    {state === "running" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" />}{label}
  </span>;
}

export function TaskScheduleStatus({ task }: { task: TaskRecord }) {
  const label = taskScheduleLabel(task);
  if (!label) return null;
  return <span className="flex items-start gap-1.5 text-xs leading-relaxed text-muted"><Clock3 size={13} aria-hidden className="mt-0.5 shrink-0" /><span>{label}</span></span>;
}

export function WorkingIndicator({ label, since, actions }: { label: string; since?: string | number; actions?: ReactNode }) {
  const [now, setNow] = useState(Date.now);
  const start = useRef(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const parsed = typeof since === "number" ? since : since ? Date.parse(since) : start.current;
  const seconds = Math.max(0, Math.floor((now - (Number.isFinite(parsed) ? parsed : start.current)) / 1000));
  return <div className="flex min-w-0 items-center gap-2.5 text-sm">
    <LoaderCircle size={15} aria-hidden className="shrink-0 animate-spin text-primary" />
    <span role="status" className="min-w-0 flex-1 break-words text-body">{label}<span aria-hidden className="task-working-ellipsis">…</span></span>
    <span aria-hidden className="shrink-0 text-xs tabular-nums text-muted">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
    {actions}
  </div>;
}

/** Public work updates arrive over SSE; each streamed message updates in place. */
export function TaskActivity({ task, events, actions }: { task: TaskRecord; events?: TaskEvent[]; actions?: ReactNode }) {
  const preparation = preparationState(task);
  const preparing = preparation === "clarifying" || preparation === "planning";
  const run = task.current_run || task.run;
  const state = preparing ? preparation : run?.state;
  const current = run?.steps?.find(step => step.key === run.current_step || step.status === "running" || step.status === "verifying");
  const all = mergeTaskEvents(task.events, run?.events, events);
  const relevant = all.filter(event => preparing ? !event.run_id : event.run_id === run?.id);
  const stage = [...relevant].reverse().find(event => event.type === "phase_started" || event.type === "created" || event.type === "step_started" || event.type === "run_verifying");
  const working = preparing || ["queued", "running", "verifying"].includes(state || "");
  const visible = working ? relevant : all;
  const rows = visible.filter(event => event.type !== "created" && event.text?.trim()).slice(-50);
  const log = useRef<HTMLDivElement>(null);
  const follows = useRef(true);
  const last = rows[rows.length - 1];
  useEffect(() => { if (log.current && follows.current) log.current.scrollTop = log.current.scrollHeight; }, [last?.seq, last?.text, rows.length]);
  if (!working && !rows.length) return null;
  const label = preparing ? preparation === "clarifying" ? "整理需求" : "生成计划" : state === "queued" ? "排队中" : state === "verifying" || current?.status === "verifying" ? "核验交付" : current?.title || current?.label || "执行任务";
  const history = <div ref={log} role="log" aria-live={working ? "polite" : "off"} aria-relevant="additions text" aria-label="工作进展记录" onScroll={() => { const el = log.current; if (el) follows.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32; }} className="max-h-60 space-y-2 overflow-y-auto text-xs leading-relaxed text-muted">
    {rows.map((event, index) => <p key={event.message_id || event.seq || `${event.ts}:${index}`} className={`flex items-start gap-2 ${working && index === rows.length - 1 ? "text-body" : ""}`}><span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" /><span className="min-w-0 whitespace-pre-wrap break-words">{event.text}</span></p>)}
  </div>;
  if (!working) return <details className="rounded-lg border border-border-solid bg-surface/40 p-4 text-xs text-muted"><summary className="min-h-7 cursor-pointer">工作进展记录</summary><div className="mt-2">{history}</div></details>;
  return <section aria-label="任务进展" className="space-y-3 rounded-lg border border-border-solid bg-surface/40 p-4">
    <WorkingIndicator key={`${task.id}:${state}:${current?.key || ""}`} label={label} since={preparing ? stage?.ts || task.created_at : stage?.ts || run?.started_at || run?.queued_at} actions={actions} />
    <div aria-hidden className="task-working-track h-0.5 overflow-hidden rounded-full bg-primary/10"><span className="block h-full w-1/3 rounded-full bg-primary/60" /></div>
    {rows.length > 0 && history}
  </section>;
}
