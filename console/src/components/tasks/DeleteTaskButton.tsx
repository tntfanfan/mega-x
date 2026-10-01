import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { api, ApiError, apiErrorMessage } from "../../lib/api";
import { deleteTaskCommand, postTaskCommand } from "../../lib/taskCommands";
import { preparationState, taskListState, type TaskRecord } from "../../lib/tasks";

async function removeTask(base: string, taskId: string) {
  const url = `${base}/tasks/${taskId}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { await deleteTaskCommand(url); return; }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || Date.now() >= deadline) throw error;
      const latest = await api.get<TaskRecord>(url);
      const preparation = preparationState(latest);
      const run = latest.current_run || latest.run;
      if (["clarifying", "planning"].includes(preparation)) {
        try { await postTaskCommand(`${url}/preparation/cancel`, {}); }
        catch (e) { if (!(e instanceof ApiError) || ![400, 409].includes(e.status)) throw e; }
      }
      if (run && ["queued", "running", "verifying", "paused", "interrupted", "waiting_input"].includes(run.state) && !run.control?.cancel_requested) {
        try { await postTaskCommand(`${url}/runs/${run.id}/cancel`, {}); }
        catch (e) { if (!(e instanceof ApiError) || ![400, 409].includes(e.status)) throw e; }
      }
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
}

export function DeleteTaskButton({ base, task, onDeleted }: { base: string; task: TaskRecord; onDeleted: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!confirming) return;
    cancel.current?.focus();
    const outside = (e: PointerEvent) => { if (!busy && !root.current?.contains(e.target as Node)) setConfirming(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [confirming, busy]);
  const close = () => { setConfirming(false); trigger.current?.focus(); };
  const remove = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { await removeTask(base, task.id); onDeleted(task.id); }
    catch (e) { setError(apiErrorMessage(e, "删除失败，请重试")); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <div ref={root} className="relative shrink-0" onKeyDown={e => { if (e.key === "Escape" && !busy) { e.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" aria-label={`删除任务：${task.title}`} aria-expanded={confirming} title="删除任务" onClick={() => { setConfirming(!confirming); setError(""); }} className="inline-flex h-9 w-9 items-center justify-center rounded text-muted/70 hover:bg-fusion/10 hover:text-fusion">
      <Trash2 size={15} aria-hidden />
    </button>
    {confirming && <div role="dialog" aria-label="删除任务" className="absolute end-0 top-full z-20 mt-1 w-60 rounded-lg border border-border-solid bg-surface p-3 text-start shadow-xl">
      <p className="text-sm text-heading">删除任务？</p>
      {taskListState(task) === "running" && <p className="mt-1 text-xs text-muted">将停止当前执行</p>}
      {error && <p role="alert" className="mt-2 text-xs text-fusion">{error}</p>}
      <div className="mt-3 flex justify-end gap-2 text-xs">
        <button ref={cancel} type="button" disabled={busy} onClick={close} className="min-h-9 rounded px-3 text-muted disabled:opacity-50">取消</button>
        <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-fusion px-3 text-white disabled:opacity-50">{busy && <LoaderCircle size={12} aria-hidden className="animate-spin" />}{busy ? "删除中" : "删除"}</button>
      </div>
    </div>}
  </div>;
}
