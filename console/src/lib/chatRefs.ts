/**
 * Unified "bring into chat" refs — task / plan step / artifact.
 * One primitive for discussing failures, steps, and deliverables in dept chat.
 */

export type ChatRefType = "task" | "step" | "artifact";

export type ChatRef = {
  type: ChatRefType;
  id: string;
  taskId?: string;
  label: string;
  detail?: string;
};

export function refKey(ref: ChatRef): string {
  return `${ref.type}:${ref.id}:${ref.taskId ?? ""}`;
}

export function mergeRefs(existing: ChatRef[] | undefined, next: ChatRef[]): ChatRef[] {
  const map = new Map<string, ChatRef>();
  for (const r of existing ?? []) map.set(refKey(r), r);
  for (const r of next) map.set(refKey(r), r);
  return Array.from(map.values()).slice(0, 8);
}

export function refsForApi(refs: ChatRef[]): Array<{
  type: ChatRefType;
  id: string;
  task_id?: string;
  label?: string;
  detail?: string;
}> {
  return refs.map((r) => ({
    type: r.type,
    id: r.id,
    task_id: r.taskId,
    label: r.label,
    detail: r.detail,
  }));
}

/** Normalize server / loosely-typed rows into ChatRef[]. */
export function normalizeRefs(raw: unknown): ChatRef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ChatRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type || "");
    if (type !== "task" && type !== "step" && type !== "artifact") continue;
    const id = String(o.id || "").trim();
    if (!id) continue;
    const taskId = (o.task_id ?? o.taskId) as string | undefined;
    out.push({
      type,
      id,
      taskId: taskId ? String(taskId) : undefined,
      label: String(o.label || id).slice(0, 120),
      detail: o.detail != null ? String(o.detail).slice(0, 400) : undefined,
    });
  }
  return out.length ? out : undefined;
}

export function taskRef(task: {
  id: string;
  title: string;
  state?: string;
  brief?: string;
}): ChatRef {
  return {
    type: "task",
    id: task.id,
    taskId: task.id,
    label: task.title,
    detail: task.state
      ? `状态: ${task.state}${task.brief ? ` · ${task.brief.slice(0, 80)}` : ""}`
      : task.brief?.slice(0, 120),
  };
}

export function stepRef(task: {
  id: string;
  title: string;
}, step: {
  key: string;
  label?: string;
  status?: string;
}, detail?: string): ChatRef {
  return {
    type: "step",
    id: step.key,
    taskId: task.id,
    label: `${task.title} · ${step.label || step.key}`,
    detail: detail || (step.status === "failed" ? "该步骤失败" : undefined),
  };
}

export function artifactRef(art: {
  id: string;
  name: string;
  task_id?: string;
}, taskTitle?: string): ChatRef {
  return {
    type: "artifact",
    id: art.id,
    taskId: art.task_id,
    label: taskTitle ? `${art.name} · ${taskTitle}` : art.name,
  };
}
