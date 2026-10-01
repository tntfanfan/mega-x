import { useEffect, useState } from "react";
import { postTaskCommand, putTaskCommand } from "../../lib/taskCommands";
import { api } from "../../lib/api";
import { formatTaskTime, planSteps, taskStateLabel, type PlanStep, type Run, type TaskRecord } from "../../lib/tasks";
import type { WorkspaceScope } from "../../lib/workspaceScope";

const input = "mt-1 w-full min-w-0 rounded border border-border-solid bg-surface px-3 py-2 text-sm focus:border-primary";
const primary = "min-h-10 rounded bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50";
export type TaskAction = (work: () => Promise<unknown>) => Promise<void>;

function useDraft<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? initial; } catch { return initial; } });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

export function ClarificationPanel({ scope, task, action, busy }: { scope: WorkspaceScope; task: TaskRecord; action: TaskAction; busy: boolean }) {
  const questions = task.clarify?.questions || [];
  const key = `task-answers:${scope.base}:${task.id}:${task.clarify?.current_batch_id || questions.map(q => q.id).join(",")}`;
  const initialAnswers = { ...task.clarify?.answers };
  for (const q of questions) {
    const value = initialAnswers[q.id];
    if (q.kind === "multi" && Array.isArray(value)) initialAnswers[q.id] = value.filter(option => q.options?.includes(option));
  }
  const [answers, setAnswers] = useDraft<Record<string, string | string[]>>(key, initialAnswers);
  const [custom, setCustom] = useDraft<Record<string, { selected: boolean; text: string }>>(`${key}:custom`, Object.fromEntries(
    questions.filter(q => q.kind !== "text" && task.clarify?.custom_answers?.[q.id]).map(q => [q.id, { selected: true, text: task.clarify!.custom_answers![q.id] }]),
  ));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const answer = (id: string, value: string | string[]) => setAnswers(current => ({ ...current, [id]: value }));
  const selectCustom = (id: string, selected: boolean) => setCustom(current => ({ ...current, [id]: { text: current[id]?.text || "", selected } }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const missing: Record<string, string> = {};
    for (const q of questions) {
      if (q.kind !== "text" && custom[q.id]?.selected) {
        if (!custom[q.id].text.trim()) missing[q.id] = "请填写自定义回答";
        continue;
      }
      const value = answers[q.id];
      if (q.required !== false && (!value || Array.isArray(value) && !value.length || typeof value === "string" && !value.trim())) missing[q.id] = "请补充这个答案";
    }
    setErrors(missing);
    if (Object.keys(missing).length) { document.getElementById(`question-${Object.keys(missing)[0]}`)?.focus(); return; }
    void action(async () => {
      await postTaskCommand(`${scope.base}/tasks/${task.id}/answers`, {
        answers: Object.fromEntries(questions.filter(q => answers[q.id] !== undefined && !(q.kind === "single" && custom[q.id]?.selected)).map(q => [q.id, answers[q.id]])),
        custom_answers: Object.fromEntries(questions.filter(q => q.kind !== "text" && custom[q.id]?.selected).map(q => [q.id, custom[q.id].text.trim()])),
        batch_id: task.clarify?.current_batch_id,
        revision: task.revision,
      });
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}:custom`);
    });
  };
  return <form onSubmit={submit} className="space-y-5">
    {questions.map(q => <fieldset key={q.id} className="min-w-0 space-y-2"><legend id={`question-${q.id}`} tabIndex={-1} title={q.reason} className="mb-2 text-sm text-heading">{q.text}{q.required === false && <span className="ms-1 text-xs text-muted">（可选）</span>}</legend>
      {q.kind === "text" ? <textarea aria-label={q.text} rows={3} value={typeof answers[q.id] === "string" ? answers[q.id] as string : ""} onChange={e => answer(q.id, e.target.value)} className={input} /> : <div className="space-y-2">{(q.options || []).map(option => {
        const values = Array.isArray(answers[q.id]) ? answers[q.id] as string[] : [];
        const checked = q.kind === "multi" ? values.includes(option) : !custom[q.id]?.selected && answers[q.id] === option;
        return <label key={option} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-primary/60 bg-primary/10" : "border-border-solid"}`}><input type={q.kind === "multi" ? "checkbox" : "radio"} name={q.id} checked={checked} onChange={e => { if (q.kind === "single") selectCustom(q.id, false); answer(q.id, q.kind === "multi" ? e.target.checked ? [...values, option] : values.filter(v => v !== option) : option); }} /><span className="min-w-0 flex-1">{option}</span>{q.default === option && <span className="shrink-0 text-xs text-muted">建议</span>}</label>;
      })}
        <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${custom[q.id]?.selected ? "border-primary/60 bg-primary/10" : "border-border-solid"}`}><input type={q.kind === "multi" ? "checkbox" : "radio"} name={q.id} checked={custom[q.id]?.selected || false} onChange={e => selectCustom(q.id, e.target.checked)} />其他</label>
        {custom[q.id]?.selected && <label className="block text-sm text-body" htmlFor={`custom-answer-${q.id}`}>你的想法<textarea id={`custom-answer-${q.id}`} aria-label={`${q.text}：自定义回答`} aria-describedby={errors[q.id] ? `answer-error-${q.id}` : undefined} aria-invalid={Boolean(errors[q.id])} autoFocus rows={3} value={custom[q.id].text} onChange={e => setCustom(current => ({ ...current, [q.id]: { selected: true, text: e.target.value } }))} placeholder="直接输入你的想法或补充要求" className={input} /></label>}
      </div>}
      {q.default && q.kind === "text" && <button type="button" className="min-h-8 text-xs text-primary" onClick={() => answer(q.id, q.default!)}>采用建议：{q.default}</button>}
      {errors[q.id] && <p id={`answer-error-${q.id}`} role="alert" className="mt-1 text-xs text-fusion">{errors[q.id]}</p>}
    </fieldset>)}<button disabled={busy} type="submit" className={primary}>{busy ? "提交中…" : "继续"}</button>
  </form>;
}

export function PlanReview({ scope, task, action, busy }: { scope: WorkspaceScope; task: TaskRecord; action: TaskAction; busy: boolean }) {
  const initial = planSteps(task);
  const version = task.plan_doc?.version || 1;
  const key = `task-plan:${scope.base}:${task.id}:v${version}`;
  const [steps, setSteps] = useDraft<PlanStep[]>(key, initial);
  const [feedback, setFeedback] = useDraft<string>(`${key}:feedback`, "");
  const update = (index: number, patch: Partial<PlanStep>) => setSteps(current => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  const confirm = () => void action(async () => {
    let confirmedVersion = version;
    let confirmedRevision = task.revision;
    if (JSON.stringify(steps) !== JSON.stringify(initial)) {
      const saved = await putTaskCommand<TaskRecord>(`${scope.base}/tasks/${task.id}/plan`, { steps, revision: task.revision, execution_mode: task.plan_doc?.execution_mode });
      confirmedVersion = saved.plan_doc?.version || version + 1;
      confirmedRevision = saved.revision;
    }
    await postTaskCommand(`${scope.base}/tasks/${task.id}/plan/confirm`, { version: confirmedVersion, task_revision: confirmedRevision, answers_revision: task.clarify?.answers_revision });
    localStorage.removeItem(key);
  });
  return <section className="space-y-4"><p className="text-xs text-muted">计划 · {steps.length} 步</p>
    {steps.map((step, i) => <div key={step.key} className="rounded border border-border-solid bg-surface/60 p-4"><label className="block text-sm text-heading">{step.phase ? `${step.phase} · ` : ""}步骤 {i + 1}<input aria-label={`步骤 ${i + 1} 标题`} value={step.title || step.label || ""} onChange={e => update(i, { title: e.target.value })} className={input} /></label><details className="mt-2 text-sm text-muted"><summary className="cursor-pointer">查看交付与验收要求</summary><label className="mt-2 block">具体工作<textarea rows={3} value={step.instructions || ""} onChange={e => update(i, { instructions: e.target.value })} className={input} /></label><p className="mt-2">输入：{(step.inputs || []).join("、") || "任务资料与前序结果"}</p><p>交付：{(step.deliverables || []).join("、") || step.title}{step.final ? " · 最终交付" : ""}</p><label className="mt-2 block">验收条件<textarea rows={2} value={step.acceptance || ""} onChange={e => update(i, { acceptance: e.target.value })} className={input} /></label><p className="mt-2">预期格式：{(step.expected || []).join("、") || "按部门规范"}</p>{step.depends_on?.length ? <p>依赖步骤：{step.depends_on.join("、")}</p> : null}{step.external_side_effect && <p className="text-fusion">此步骤可能发送、发布或修改外部资源。</p>}</details></div>)}
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <label className="block text-sm font-medium text-primary">调整计划<textarea aria-label="修改意见" rows={3} disabled={busy} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="希望怎么调整？例如增减步骤、修改交付内容或执行顺序。" className={input} /></label>
      <button type="button" disabled={busy || !feedback.trim()} className="min-h-10 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50" onClick={() => void action(() => postTaskCommand(`${scope.base}/tasks/${task.id}/plan/regenerate`, { feedback }))}>按修改意见重新生成</button>
    </div>
    <button type="button" disabled={busy || !steps.length || steps.some(s => !s.title?.trim())} onClick={confirm} className={primary}>{busy ? "提交中…" : "确认计划"}</button>
  </section>;
}

export function RunTimeline({ run, onOpenFile }: { run: Run; onOpenFile: (path: string) => void }) {
  const steps = run.steps || [];
  const done = steps.filter(step => step.status === "done").length;
  const elapsed = run.started_at && run.ended_at ? Math.max(1, Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 60000)) : null;
  const stepLabels: Record<string, string> = { pending: "待执行", running: "执行中", verifying: "核验中", done: "完成", failed: "需处理", blocked: "待补充", skipped: "跳过" };
  const files = run.state === "done" ? run.final_outputs?.map(output => output.path) || run.acceptance_result?.files || [] : [];
  return <section className="space-y-3">
    <div className="flex items-center justify-between text-xs text-muted"><span>步骤 · {done}/{steps.length}</span>{run.state === "done" && elapsed !== null && <span>用时 {elapsed} 分钟</span>}</div>
    {steps.length > 0 && <div role="progressbar" aria-label="步骤进度" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} className="h-1 overflow-hidden rounded-full bg-primary/10"><div className="h-full bg-primary/70 transition-[width]" style={{ width: `${done / steps.length * 100}%` }} /></div>}
    {run.wait_reason && <p className="text-xs text-primary">{run.wait_reason}</p>}
    {run.error && <p className="text-sm text-fusion">{run.error}</p>}
    {files.length > 0 && <div className="space-y-1">{files.map(file => <button type="button" key={file} className="block min-h-9 max-w-full truncate text-sm text-primary hover:underline" onClick={() => onOpenFile(`${run.output_dir}/${file}`)}>{file.split("/").pop()}</button>)}</div>}
    <ol className="space-y-1">{steps.map((step, index) => <li key={step.key} className="border-b border-border-solid/50 py-3 last:border-0">
      <div className="flex items-start gap-2 text-sm"><span aria-hidden className={step.status === "running" || step.status === "verifying" ? "animate-pulse text-primary" : "text-muted"}>{step.status === "done" ? "✓" : step.status === "running" || step.status === "verifying" ? "◌" : step.status === "failed" || step.status === "blocked" ? "!" : "○"}</span><span className="min-w-0 flex-1 break-words text-heading">{index + 1}. {step.title || step.label || step.key}</span><span className="shrink-0 text-xs text-muted">{stepLabels[step.status || "pending"] || step.status}</span></div>
      {step.summary && <p className="ms-5 mt-1 text-xs leading-relaxed text-muted">{step.summary}</p>}
      {step.needs && <p className="ms-5 mt-1 text-sm text-primary">{step.needs}</p>}
      <details className="ms-5 mt-1 text-xs text-muted"><summary className="min-h-7 cursor-pointer">详情</summary><p className="leading-relaxed">{step.instructions}</p>{step.acceptance && <p className="mt-1">验收：{step.acceptance}</p>}<p className="mt-1">{formatTaskTime(step.started_at)} → {formatTaskTime(step.ended_at)}</p>{step.outputs?.map(file => <button key={file} type="button" onClick={() => onOpenFile(`${run.output_dir}/${file}`)} className="mt-1 block min-h-8 max-w-full truncate text-xs text-primary hover:underline">{file.split("/").pop()}</button>)}</details>
    </li>)}</ol>
    {run.events?.length ? <details className="text-xs text-muted"><summary className="min-h-8 cursor-pointer">过程</summary><ol className="mt-2 max-h-60 space-y-2 overflow-y-auto">{run.events.map((event, i) => <li key={event.seq || i} className="flex items-start gap-3"><span className="shrink-0 text-muted/60">{formatTaskTime(event.ts)}</span><span className="min-w-0 whitespace-pre-wrap break-words">{event.text}</span></li>)}</ol></details> : null}
  </section>;
}

export function RunHistory({ task, selected, onSelect }: { task: TaskRecord; selected: string; onSelect: (id: string) => void }) {
  return <label className="block text-sm text-body">执行历史<select className={input} value={selected} onChange={e => onSelect(e.target.value)}><option value="">当前执行</option>{(task.runs || []).map(run => <option key={run.id} value={run.id}>{formatTaskTime(run.started_at || run.ended_at)}{run.resumed_from ? " · 从中断处继续" : ""} · {taskStateLabel(run.state)}{run.skip_reason === "overlap" ? " · 上一轮仍在运行" : ""}</option>)}</select></label>;
}
