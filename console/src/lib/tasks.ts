/** Task v2 shapes. Field names mirror tenancy/task_schema.py. */

export type TaskKind = "long" | "scheduled";

export type TaskState =
  | "draft" | "clarifying" | "awaiting_input" | "planning" | "plan_review"
  | "queued" | "running" | "paused" | "active" | "done" | "failed"
  | "cancelled" | "archived"
  | "pending" | "in_progress" | "review";

export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked" | "skipped";

export type PlanStep = {
  key: string;
  title?: string;
  label?: string;
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
};

export type PlanDoc = {
  version?: number;
  confirmed_at?: string | null;
  execution_mode?: "stepwise" | "single_turn";
  steps?: PlanStep[];
};

export type Schedule = {
  cron: string;
  preset?: { type?: string; time?: string; dow?: number; day?: number; every?: number; minute?: number } | null;
  tz?: string;
  enabled?: boolean;
  overlap?: "skip" | "queue";
  misfire?: "run_once" | "skip";
  next_run_at?: string | null;
  last_fired_at?: string | null;
  consecutive_failures?: number;
};

export type ClarifyQuestion = {
  id: string;
  text: string;
  kind: "single" | "multi" | "text";
  options?: string[] | null;
  default?: string | null;
  required?: boolean;
};

export type RunStep = PlanStep & { attempts?: number; session_id?: string | null };

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
  started_at?: string | null;
  ended_at?: string | null;
  events?: { ts: string; type: string; text: string; step?: string | null }[];
};

export type TaskRecord = {
  id: string;
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
  plan_steps?: PlanStep[];
  schedule?: Schedule | null;
  clarify?: { questions?: ClarifyQuestion[]; answers?: Record<string, string> };
  progress?: number;
  last_run?: { id: string; state: string; started_at?: string | null; ended_at?: string | null } | null;
  current_run_id?: string | null;
  run?: Run | null;
  runs?: { id: string; state: string; trigger?: string; started_at?: string | null; ended_at?: string | null; skip_reason?: string | null }[];
  created_at?: string;
  updated_at?: string;
};

export function planSteps(task: { plan?: unknown; plan_steps?: PlanStep[] } | null | undefined): PlanStep[] {
  if (!task) return [];
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
  const preset = schedule?.preset;
  const time = preset?.time || "08:00";
  if (!preset?.type) return schedule?.cron || "";
  if (preset.type === "hours" || preset.type === "hourly") return `每 ${preset.every || 1} 小时`;
  if (preset.type === "daily") return `每天 ${time}`;
  if (preset.type === "weekdays") return `工作日 ${time}`;
  if (preset.type === "weekly") return `每周 ${preset.dow ?? ""} ${time}`;
  if (preset.type === "monthly") return `每月 ${preset.day ?? ""} 日 ${time}`;
  return schedule?.cron || "";
}

const LIVE = new Set(["clarifying", "planning", "queued", "running", "awaiting_input", "plan_review", "pending", "in_progress"]);

export function taskIsLive(state: string | undefined): boolean {
  return LIVE.has(state || "");
}
