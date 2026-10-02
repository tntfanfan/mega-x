/** Unified tasks; legacy shapes remain readable. */

export type TaskKind = "long" | "scheduled";

export type TaskState =
  | "draft" | "clarifying" | "awaiting_input" | "planning" | "plan_review"
  | "queued" | "running" | "paused" | "active" | "done" | "failed"
  | "cancelled" | "archived" | "waiting_input" | "interrupted"
  | "schedule_setup" | "ready" | "verifying"
  | "pending" | "in_progress" | "review";

export type StepStatus = "pending" | "running" | "verifying" | "done" | "failed" | "blocked" | "skipped";

export type PlanStep = {
  key: string;
  title?: string;
  label?: string;
  instructions?: string;
  inputs?: string[];
  deliverables?: string[];
  final?: boolean;
  dept_id?: string;
  status?: StepStatus | string;
  expected?: string[];
  acceptance?: string;
  depends_on?: string[];
  timeout_s?: number | null;
  summary?: string;
  outputs?: string[];
  needs?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  phase?: string | null;
  external_side_effect?: boolean;
};

export type PlanDoc = {
  version?: number;
  confirmed_at?: string | null;
  execution_mode?: "stepwise" | "single_turn";
  steps?: PlanStep[];
  confirmed_version?: number;
  confirmed_by?: string;
  approval_source?: string;
};

export type Schedule = {
  mode?: "immediate" | "scheduled";
  type?: "cron" | "at" | "interval";
  cron?: string;
  at?: string | null;
  interval_seconds?: number | null;
  anchor_at?: string | null;
  revision?: number;
  preset?: { type?: string; time?: string; dow?: number; days?: number[]; day?: number; every?: number; minute?: number } | null;
  tz?: string;
  enabled?: boolean;
  overlap?: "skip" | "queue";
  misfire?: "run_once" | "skip";
  next_run_at?: string | null;
  last_fired_at?: string | null;
  consecutive_failures?: number;
  effective_at?: string | null;
  block_reason?: string | null;
};

export const scheduleExecutionPolicy = { overlap: "skip", misfire: "run_once" } as const;

export type ClarifyQuestion = {
  id: string;
  text: string;
  kind: "single" | "multi" | "text";
  options?: string[] | null;
  default?: string | null;
  required?: boolean;
  reason?: string;
};

export type RunStep = PlanStep & { attempts?: number; session_id?: string | null };

export type TaskEvent = {
  seq?: number;
  ts: string;
  type: string;
  text: string;
  task_id?: string;
  run_id?: string | null;
  step?: string | null;
  message_id?: string;
  phase?: string;
};

export type Run = {
  id: string;
  task_id: string;
  trigger?: string;
  state: string;
  skip_reason?: string | null;
  steps?: RunStep[];
  current_step?: string | null;
  output_dir?: string;
  error?: string | null;
  guidance?: string | null;
  queued_at?: string;
  scheduled_at?: string | null;
  wait_reason?: string | null;
  attempt?: number;
  resumed_from?: string | null;
  acceptance_result?: { passed: boolean; files?: string[] };
  final_outputs?: { path: string; name: string; plan_version: number; verified_at: string }[];
  plan_version?: number;
  task_snapshot?: { plan?: PlanDoc; goal?: string };
  schedule_revision?: number;
  logical_run_id?: string;
  control?: { cancel_requested?: boolean; pause_requested?: boolean };
  started_at?: string | null;
  ended_at?: string | null;
  events?: TaskEvent[];
};

export type TaskRecord = {
  id: string;
  schema?: number;
  kind?: TaskKind;
  title: string;
  goal?: string;
  brief?: string;
  state: TaskState | string;
  lead_dept_id?: string;
  dept_id?: string;
  participant_dept_ids?: string[];
  expected_outputs?: string[];
  plan?: PlanDoc | PlanStep[];
  plan_doc?: PlanDoc;
  plan_steps?: PlanStep[];
  schedule?: Schedule | null;
  clarify?: { questions?: ClarifyQuestion[]; answers?: Record<string, string | string[]>; custom_answers?: Record<string, string>; current_batch_id?: string; answers_revision?: number; batches?: { id: string; questions: ClarifyQuestion[]; answers?: Record<string, string | string[]>; custom_answers?: Record<string, string> }[] };
  revision?: number;
  runtime_owner?: "container" | "platform";
  runtime_available?: boolean;
  auto_start?: boolean;
  activation_requested?: boolean;
  active_plan_version?: number;
  activated_at?: string;
  draft_state?: string | null;
  preparation_state?: string;
  schedule_candidate?: Schedule;
  event_cursor?: number;
  events?: TaskEvent[];
  accepted_run_id?: string | null;
  current_run?: Run | null;
  wait_reason?: string | null;
  queue?: { ahead: number | null; active: number; capacity: number };
  progress?: number;
  last_run?: { id: string; state: string; started_at?: string | null; ended_at?: string | null; completed_steps?: number; required_steps?: number; current_step_title?: string } | null;
  current_run_id?: string | null;
  run?: Run | null;
  runs?: { id: string; state: string; trigger?: string; resumed_from?: string | null; logical_run_id?: string; started_at?: string | null; ended_at?: string | null; skip_reason?: string | null }[];
  created_at?: string;
  updated_at?: string;
};

export function planSteps(task: { plan?: unknown; plan_doc?: PlanDoc; plan_steps?: PlanStep[] } | null | undefined): PlanStep[] {
  if (!task) return [];
  if (task.plan_doc?.steps?.length) return task.plan_doc.steps;
  if (Array.isArray(task.plan_steps) && task.plan_steps.length) return task.plan_steps;
  const plan = task.plan;
  if (Array.isArray(plan)) return plan as PlanStep[];
  if (plan && typeof plan === "object" && Array.isArray((plan as PlanDoc).steps)) {
    return (plan as PlanDoc).steps || [];
  }
  return [];
}

export function runProgress(task: TaskRecord): number {
  const steps = task.run?.steps || planSteps(task);
  if (!steps.length) return task.progress || 0;
  const done = steps.filter((s) => s.status === "done").length;
  return done / steps.length;
}

export function describeSchedule(schedule: Schedule | null | undefined): string {
  if (!schedule) return "待设置执行时间";
  if (schedule.mode === "immediate") return "执行一次";
  if (schedule?.type === "at") return `执行一次 · ${formatTaskTime(schedule.at, schedule.tz)}`;
  if (schedule?.type === "interval") return `每隔 ${(schedule.interval_seconds || 900) / 60} 分钟`;
  const preset = schedule?.preset;
  const time = preset?.time || "08:00";
  if (!preset?.type) return schedule?.cron || "";
  if (preset.type === "hours" || preset.type === "hourly") return `每 ${preset.every || 1} 小时`;
  if (preset.type === "daily") return `每天 ${time}`;
  if (preset.type === "weekdays") return `周一至周五 ${time}`;
  if (preset.type === "weekly") return `每周 ${(preset.days || [preset.dow ?? 1]).map(d => ["日", "一", "二", "三", "四", "五", "六"][d]).join("、")} ${time}`;
  if (preset.type === "monthly") return `每月 ${preset.day ?? ""} 日 ${time}`;
  return schedule?.cron || "";
}

const LIVE = new Set(["clarifying", "planning", "queued", "running", "verifying", "awaiting_input", "plan_review", "waiting_input", "pending", "in_progress"]);

export function taskIsLive(state: string | undefined): boolean {
  return LIVE.has(state || "");
}

const STATE_LABELS: Record<string, string> = {
  draft: "草稿", clarifying: "正在整理需求", awaiting_input: "需要你补充", planning: "正在生成计划",
  plan_review: "计划待确认", schedule_setup: "已确认计划，待设置执行时间", ready: "已就绪", verifying: "正在验收",
  queued: "排队中", running: "正在执行", paused: "本次已暂停", active: "自动执行已开启",
  done: "本次已完成", failed: "执行遇到问题", cancelled: "本次已停止", archived: "已归档", interrupted: "运行已中断",
  waiting_input: "等待补充信息", skipped: "已跳过", pending: "待执行", in_progress: "正在执行", review: "已完成",
  blocked: "需要补充信息",
};
export function taskStateLabel(state: string | undefined): string { return STATE_LABELS[state || ""] || "等待更新"; }
export function preparationState(task: TaskRecord): string { return task.preparation_state || task.draft_state || String(task.state); }
export function taskDisplayState(task: TaskRecord): string {
  const preparation = preparationState(task);
  if (task.state === "archived" || !["ready", "active", "paused", "done"].includes(preparation)) return preparation;
  return task.current_run?.state || task.run?.state || task.last_run?.state || String(task.state);
}

export function taskStatusLabel(task: TaskRecord): string {
  const state = taskDisplayState(task);
  if (task.schedule?.enabled && ["ready", "active", "pending"].includes(state)) return "等待定时执行";
  if (task.schedule?.enabled && ["done", "review", "skipped"].includes(state)) return "等待下轮执行";
  return taskStateLabel(state);
}

export function taskScheduleLabel(task: TaskRecord): string | null {
  const schedule = task.schedule;
  if (!schedule || schedule.mode === "immediate" || schedule.mode !== "scheduled" && !schedule.type && !schedule.preset) return null;
  const frequency = describeSchedule(schedule);
  if (schedule.block_reason) {
    const reason = { consecutive_failures: "连续失败 3 次", max_runs: "已达执行次数上限", end_at: "已到结束时间" }[schedule.block_reason];
    return `${frequency} · 定时已暂停${reason ? ` · ${reason}` : ""}`;
  }
  if (!schedule.enabled) return `${frequency} · ${schedule.last_fired_at && !schedule.next_run_at ? "定时已结束" : "定时已暂停"}`;
  return `${frequency} · 下次执行：${schedule.next_run_at ? formatTaskTime(schedule.next_run_at, schedule.tz) : "待更新"}`;
}

/** Used for activity styling and controls; waiting for a timer is idle. */
export function taskListState(task: TaskRecord): "pending" | "running" | "done" {
  const state = taskDisplayState(task);
  if (["clarifying", "planning", "queued", "running", "verifying", "in_progress"].includes(state)) return "running";
  if (["draft", "awaiting_input", "plan_review", "schedule_setup", "waiting_input", "failed", "interrupted", "paused", "cancelled", "blocked"].includes(state)) return "pending";
  if (state === "done" || state === "review" || state === "archived" && task.last_run?.state === "done") return "done";
  return "pending";
}

export function mergeTaskEvents(...groups: (TaskEvent[] | undefined)[]): TaskEvent[] {
  const rows = new Map<string, TaskEvent>();
  for (const group of groups) for (const event of group || []) {
    const key = event.message_id ? `message:${event.message_id}` : event.seq ? `seq:${event.seq}` : `${event.ts}:${event.type}:${event.run_id || ""}:${event.text}`;
    const previous = rows.get(key);
    // A delayed HTTP snapshot must not replace newer streamed text.
    if (!previous || (event.seq && previous.seq ? event.seq >= previous.seq : event.ts >= previous.ts)) rows.set(key, event);
  }
  return [...rows.values()].sort((a, b) => a.seq && b.seq ? a.seq - b.seq : a.ts.localeCompare(b.ts)).slice(-200);
}
export function outputTaskForContext(file: string | null, selectedTask: string | undefined): string | undefined {
  if (!file) return selectedTask;
  return /^tasks\/([^/]+)\//.exec(file)?.[1];
}
export function formatTaskTime(value: string | null | undefined, tz = "Asia/Shanghai"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("zh-CN", { timeZone: tz, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
  catch { return date.toLocaleString("zh-CN"); }
}
