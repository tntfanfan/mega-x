import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../../lib/api";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import {
  describeSchedule, planSteps, runProgress, taskIsLive, type PlanStep, type TaskRecord,
} from "../../lib/tasks";
import { usePoll } from "../../hooks/usePoll";
import { useHorizontalSplit } from "../../hooks/useHorizontalSplit";
import { OutputsPane } from "../outputs/OutputsPane";
import { Segmented } from "../ui/Segmented";

export function WorkspaceTasks({ scope }: { scope: WorkspaceScope }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const kind = (params.get("kind") === "scheduled" ? "scheduled" : "long") as "long" | "scheduled";
  const selected = params.get("task") || "";
  const [items, setItems] = useState<TaskRecord[]>([]);
  const [detail, setDetail] = useState<TaskRecord | null>(null);
  const [error, setError] = useState("");
  const [mobilePane, setMobilePane] = useState<"detail" | "outputs">("detail");
  const {
    containerRef: splitRef,
    ratio: taskSplit,
    onPointerDown: startSplit,
    onKeyDown: onSplitKeyDown,
  } = useHorizontalSplit({
    storageKey: "lgh.workspaceTasks.split",
    initialRatio: 0.56,
    minStart: 320,
    minEnd: 360,
  });

  const load = () => {
    api.get<{ items: TaskRecord[] }>(`${scope.base}/tasks?kind=${kind}`)
      .then((res) => setItems(res.items || []))
      .catch((e) => setError(apiErrorMessage(e, "加载任务失败")));
  };
  const live = items.some((t) => taskIsLive(String(t.state))) || taskIsLive(String(detail?.state));
  usePoll(load, 3000, 30000, live, `${scope.base}:${kind}`);

  const loadDetail = () => {
    if (!selected) { setDetail(null); return; }
    api.get<TaskRecord>(`${scope.base}/tasks/${selected}`).then(setDetail).catch(() => setDetail(null));
  };
  usePoll(loadDetail, 3000, 30000, Boolean(selected) && taskIsLive(String(detail?.state || "running")), `${scope.base}:${selected}`);

  function select(id: string) {
    const next = new URLSearchParams(params);
    next.set("task", id);
    next.set("kind", kind);
    setParams(next);
  }

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-4 py-3 border-b border-border-solid flex items-center gap-3">
        <Segmented
          value={kind}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("kind", v);
            next.delete("task");
            setParams(next);
          }}
          options={[
            { value: "long", label: "长程" },
            { value: "scheduled", label: "定时" },
          ]}
        />
        <div className="flex shrink-0 rounded border border-border-solid p-0.5 xl:hidden" role="group" aria-label={t("business.company.chat.view-label")}>
          <button type="button" onClick={() => setMobilePane("detail")} aria-pressed={mobilePane === "detail"} className={`rounded px-2 py-1 text-xs ${mobilePane === "detail" ? "bg-primary/10 text-primary" : "text-muted"}`}>
            {t("workspace.tasks.detail-tab")}
          </button>
          <button type="button" onClick={() => setMobilePane("outputs")} aria-pressed={mobilePane === "outputs"} className={`rounded px-2 py-1 text-xs ${mobilePane === "outputs" ? "bg-primary/10 text-primary" : "text-muted"}`}>
            {t("outputs.title")}
          </button>
        </div>
        <Link
          to={`${scope.routeBase}/tasks/new?kind=${kind}`}
          className="ms-auto rounded-md bg-primary text-bg px-3 py-1.5 text-xs"
        >
          新建
        </Link>
      </header>
      {error && <p className="px-4 py-1 text-xs text-fusion">{error}</p>}
      <div className="flex flex-1 min-h-0">
        <div className="w-48 shrink-0 overflow-auto border-e border-border-solid xl:w-[280px]">
          {items.length === 0 && <p className="p-3 text-xs text-muted">还没有{kind === "long" ? "长程" : "定时"}任务</p>}
          {items.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => select(task.id)}
              className={`block w-full text-start px-3 py-2 border-b border-border-solid ${selected === task.id ? "bg-surface-2" : ""}`}
            >
              <div className="text-sm text-heading truncate">{task.title}</div>
              <div className="text-[11px] text-muted truncate">
                {kind === "scheduled"
                  ? `${describeSchedule(task.schedule)} · ${task.last_run?.state || "未运行"}`
                  : `${task.dept_id || task.lead_dept_id || ""} · ${Math.round(runProgress(task) * 100)}%`}
              </div>
            </button>
          ))}
        </div>
        <div ref={splitRef} className="flex flex-1 min-w-0 min-h-0" style={{ "--task-split": `${taskSplit * 100}%` } as CSSProperties}>
          <div className={`${mobilePane === "outputs" ? "hidden xl:block" : "block"} workspace-task-detail min-w-0 overflow-auto p-4`}>
            {detail ? <TaskBody scope={scope} task={detail} onChange={loadDetail} /> : <p className="text-xs text-muted">选择一个任务</p>}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("workspace.tasks.resize")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(taskSplit * 100)}
            tabIndex={0}
            title={t("workspace.tasks.resize")}
            onPointerDown={startSplit}
            onKeyDown={onSplitKeyDown}
            className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/10 focus-visible:bg-primary/10 xl:flex"
          >
            <span className="h-10 w-0.5 rounded-full bg-border-solid transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
          </div>
          <div className={`${mobilePane === "detail" ? "hidden xl:flex" : "flex"} min-w-0 flex-1`}>
            <OutputsPane scope={scope} taskId={selected || undefined} className="flex-1" />
          </div>
        </div>
      </div>
      <button type="button" className="sr-only" onClick={() => navigate(scope.routeBase)}> </button>
    </div>
  );
}

function TaskBody({
  scope, task, onChange,
}: { scope: WorkspaceScope; task: TaskRecord; onChange: () => void }) {
  const state = String(task.state);
  const steps = task.run?.steps?.length ? task.run.steps : planSteps(task);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div>
          <h2 className="font-display text-lg text-heading">{task.title}</h2>
          <p className="text-xs text-muted">{task.kind === "scheduled" ? "定时" : "长程"} · {state}</p>
        </div>
        <div className="ms-auto flex gap-2">
          {task.run?.id && (state === "running" || state === "queued") && (
            <button type="button" className="text-xs border border-border-solid rounded px-2 py-1" onClick={() => api.post(`${scope.base}/tasks/${task.id}/runs/${task.run!.id}/pause`, {}).then(onChange)}>暂停</button>
          )}
          {task.run?.id && taskIsLive(state) && (
            <button type="button" className="text-xs border border-border-solid rounded px-2 py-1" onClick={() => api.post(`${scope.base}/tasks/${task.id}/runs/${task.run!.id}/cancel`, {}).then(onChange)}>取消</button>
          )}
        </div>
      </div>
      {(state === "clarifying" || state === "planning") && <p className="text-sm text-muted">主部门正在思考…</p>}
      {state === "awaiting_input" && <ClarifyForm scope={scope} task={task} onDone={onChange} />}
      {state === "plan_review" && <PlanEditor scope={scope} task={task} onDone={onChange} />}
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.key} className="text-sm border border-border-solid rounded px-3 py-2">
            <div className="flex gap-2">
              <span>{step.status === "done" ? "✓" : step.status === "running" ? "…" : step.status === "failed" || step.status === "blocked" ? "!" : "○"}</span>
              <span className="flex-1">{i + 1}. {step.title || step.label || step.key}</span>
              <span className="text-[11px] text-muted">{step.dept_id}</span>
            </div>
            {step.summary && <p className="text-xs text-muted mt-1">{step.summary}</p>}
            {step.needs && <p className="text-xs text-fusion mt-1">{step.needs}</p>}
          </li>
        ))}
      </ol>
      {state === "failed" && task.run?.id && <ResumeBox scope={scope} task={task} onDone={onChange} />}
      {task.kind === "scheduled" && (
        <div className="text-xs text-muted space-y-1">
          <p>周期 {describeSchedule(task.schedule)} · 下次 {task.schedule?.next_run_at || "—"}</p>
          <button type="button" className="border border-border-solid rounded px-2 py-1" onClick={() => api.post(`${scope.base}/tasks/${task.id}/runs`, { trigger: "manual" }).then(onChange)}>立即运行一次</button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={task.state === "active"}
              onChange={(e) => api.patch(`${scope.base}/tasks/${task.id}`, { enabled: e.target.checked }).then(onChange)}
            />
            {scope.kind === "sandbox" ? "测试环境不自动触发，只能手动试跑" : "启用定时"}
          </label>
        </div>
      )}
    </div>
  );
}

function ClarifyForm({ scope, task, onDone }: { scope: WorkspaceScope; task: TaskRecord; onDone: () => void }) {
  const questions = task.clarify?.questions || [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) if (q.default) init[q.id] = q.default;
    return init;
  });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); api.post(`${scope.base}/tasks/${task.id}/answers`, { answers }).then(onDone); }}>
      {questions.map((q) => (
        <label key={q.id} className="block text-sm">
          <span>{q.text}</span>
          {q.kind === "text" || !q.options?.length ? (
            <input className="mt-1 w-full bg-surface border border-border-solid rounded px-2 py-1" value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          ) : (
            <select className="mt-1 w-full bg-surface border border-border-solid rounded px-2 py-1" value={answers[q.id] || q.default || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
              {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}
        </label>
      ))}
      <button type="submit" className="rounded bg-primary text-bg px-3 py-1 text-xs">提交</button>
    </form>
  );
}

function PlanEditor({ scope, task, onDone }: { scope: WorkspaceScope; task: TaskRecord; onDone: () => void }) {
  const initial = useMemo(() => planSteps(task), [task]);
  const [steps, setSteps] = useState<PlanStep[]>(initial);
  const [feedback, setFeedback] = useState("");
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.key} className="flex gap-2 text-xs">
          <input className="flex-1 bg-surface border border-border-solid rounded px-2 py-1" value={step.title || ""} onChange={(e) => setSteps(steps.map((s, j) => j === i ? { ...s, title: e.target.value } : s))} />
          <input className="w-28 bg-surface border border-border-solid rounded px-2 py-1" value={step.dept_id || ""} onChange={(e) => setSteps(steps.map((s, j) => j === i ? { ...s, dept_id: e.target.value } : s))} />
          <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>删除</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => api.put(`${scope.base}/tasks/${task.id}/plan`, { steps }).then(() => api.post(`${scope.base}/tasks/${task.id}/plan/confirm`, {})).then(onDone)}>
          {task.kind === "scheduled" ? "确认并启用" : "确认并开始"}
        </button>
        <input className="flex-1 bg-surface border border-border-solid rounded px-2 py-1 text-xs" placeholder="让主部门重新规划" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button type="button" className="text-xs" onClick={() => api.post(`${scope.base}/tasks/${task.id}/plan/regenerate`, { feedback }).then(onDone)}>重新规划</button>
      </div>
    </div>
  );
}

function ResumeBox({ scope, task, onDone }: { scope: WorkspaceScope; task: TaskRecord; onDone: () => void }) {
  const [guidance, setGuidance] = useState("");
  const failed = (task.run?.steps || []).find((s) => s.status === "failed" || s.status === "blocked");
  return (
    <div className="space-y-2">
      <textarea className="w-full bg-surface border border-border-solid rounded px-2 py-1 text-sm" rows={3} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="补充信息后从此步重试" />
      <button
        type="button"
        className="text-xs rounded bg-primary text-bg px-3 py-1"
        onClick={() => api.post(`${scope.base}/tasks/${task.id}/runs/${task.run?.id}/resume`, { from_step: failed?.key, guidance }).then(onDone)}
      >
        从此步重试
      </button>
    </div>
  );
}
