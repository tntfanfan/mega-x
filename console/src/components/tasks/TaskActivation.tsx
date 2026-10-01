import { useId, useState } from "react";
import { postTaskCommand } from "../../lib/taskCommands";
import { type Schedule, type TaskRecord } from "../../lib/tasks";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { defaultSchedule, ScheduleFields } from "./ScheduleFields";
import type { TaskAction } from "./TaskPanels";

export function TaskActivation({ scope, task, action, busy }: { scope: WorkspaceScope; task: TaskRecord; action: TaskAction; busy: boolean }) {
  const modeId = useId();
  const [mode, setMode] = useState<"immediate" | "scheduled" | "deferred">(task.schedule_candidate ? "scheduled" : "immediate");
  const [schedule, setSchedule] = useState<Schedule>(task.schedule_candidate || defaultSchedule);
  const [valid, setValid] = useState(false);
  const [runNow, setRunNow] = useState(false);
  const activate = () => void action(() => postTaskCommand(`${scope.base}/tasks/${task.id}/activate`, {
    task_revision: task.revision,
    confirmed_plan_version: task.active_plan_version || task.plan_doc?.confirmed_version,
    schedule: mode === "scheduled" ? { ...schedule, mode, enabled: true } : { mode: "immediate", enabled: false },
    run_once_now: mode === "immediate" || mode === "scheduled" && schedule.type !== "at" && runNow,
  }));
  return <section className="space-y-4">
    <fieldset>
      <legend className="sr-only">执行方式</legend>
      <div className="grid grid-cols-3 gap-2">{([["immediate", "立即"], ["scheduled", "定时"], ["deferred", "稍后"]] as const).map(([id, label]) => <label key={id} className="min-w-0 cursor-pointer">
        <input type="radio" name={modeId} value={id} checked={mode === id} disabled={busy} onChange={() => setMode(id)} className="peer sr-only" />
        <span className={`flex h-full min-h-10 items-center justify-center rounded border px-2 py-2 text-center text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50 sm:px-3 ${mode === id ? "border-primary bg-primary/10 text-primary" : "border-border-solid text-body"}`}>{label}</span>
      </label>)}</div>
    </fieldset>
    {mode === "scheduled" && <><ScheduleFields base={scope.base} value={schedule} onChange={setSchedule} onValidity={setValid} />{schedule.type !== "at" && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={runNow} onChange={e => setRunNow(e.target.checked)} />先执行一次</label>}</>}
    <button type="button" disabled={busy || mode === "scheduled" && !valid} onClick={activate} className="min-h-9 rounded-lg bg-primary px-4 py-2 font-medium text-bg disabled:opacity-50">{busy ? "保存中…" : mode === "immediate" ? "执行" : mode === "scheduled" ? "启用定时" : "保存"}</button>
  </section>;
}
