import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, LoaderCircle } from "lucide-react";
import { apiErrorMessage } from "../../lib/api";
import { postTaskCommand } from "../../lib/taskCommands";
import type { WorkspaceScope } from "../../lib/workspaceScope";

export function TaskCreateFlow({ scope, initialGoal = "", leadDeptId, onCancel, onCreated }: { scope: WorkspaceScope; initialGoal?: string; leadDeptId?: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const storageKey = `task-create:${scope.base}`;
  const [draft, setDraft] = useState(() => {
    let stored: { title?: string; goal?: string } = {};
    try { if (!initialGoal) stored = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { /* fresh draft */ }
    return { title: stored.title || "", goal: initialGoal || stored.goal || "" };
  });
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(draft)); }, [storageKey, draft]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || !draft.goal.trim()) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const task = await postTaskCommand<{ id: string }>(`${scope.base}/tasks`, {
        title: draft.title.trim() || draft.goal.trim().slice(0, 48), goal: draft.goal.trim(),
        ...(leadDeptId ? { lead_dept_id: leadDeptId, participant_dept_ids: [leadDeptId] } : {}),
      });
      localStorage.removeItem(storageKey);
      onCreated(task.id);
    } catch (e) { setError(apiErrorMessage(e, "创建任务失败，草稿已保留，请重试")); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-4 p-5 text-sm">
    <button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-9 items-center gap-1.5 text-muted hover:text-heading disabled:opacity-50"><ArrowLeft size={15} aria-hidden />返回</button>
    <div className="rounded-xl border border-border-solid bg-surface/60 p-3 transition-colors focus-within:border-primary/60">
      <textarea aria-label="任务目标" autoFocus required disabled={busy} rows={4} value={draft.goal} onChange={e => setDraft(current => ({ ...current, goal: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        placeholder="想完成什么任务？" className="block w-full resize-y border-0 bg-transparent px-1 py-2 leading-relaxed text-body outline-none placeholder:text-muted disabled:opacity-60" />
      <div className="mt-2 flex justify-end"><button type="submit" disabled={busy || !draft.goal.trim()} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-bg disabled:opacity-40">{busy ? <LoaderCircle size={15} aria-hidden className="animate-spin" /> : <ArrowUp size={15} aria-hidden />}{busy ? "创建中" : "创建任务"}</button></div>
    </div>
    {error && <p role="alert" className="text-fusion">{error}</p>}
  </form>;
}
