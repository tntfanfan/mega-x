/**
 * Unified "bring into chat" refs — task / plan step / artifact / output path.
 * One primitive for discussing failures, steps, and deliverables in dept chat.
 */

export type ChatRefType = "task" | "step" | "artifact" | "output";

type LegacyChatRef = {
  type: Exclude<ChatRefType, "output">;
  id: string;
  taskId?: string;
  label: string;
  detail?: string;
};

export type OutputChatRef = {
  type: "output";
  id: string;
  path: string;
  label: string;
  kind?: string;
  taskId?: string;
  runId?: string;
  detail?: string;
  mtime?: number;
  size?: number;
};

export type ChatRef = LegacyChatRef | OutputChatRef;
export const MAX_CHAT_REFS = 8;

export function refKey(ref: ChatRef): string {
  return ref.type === "output" ? `output:${ref.path}` : `${ref.type}:${ref.id}:${ref.taskId ?? ""}`;
}

export function mergeRefs(existing: ChatRef[] | undefined, next: ChatRef[], onLimit?: () => void): ChatRef[] {
  const map = new Map<string, ChatRef>();
  for (const r of existing ?? []) map.set(refKey(r), r);
  for (const r of next) map.set(refKey(r), r);
  if (map.size > MAX_CHAT_REFS) {
    if (onLimit) { onLimit(); return existing ?? []; }
    throw new RangeError("最多引用 8 个产出物");
  }
  return Array.from(map.values());
}

export function refsForApi(refs: ChatRef[]): Array<{
  type: ChatRefType;
  id: string;
  task_id?: string;
  label?: string;
  detail?: string;
  path?: string;
  kind?: string;
  run_id?: string;
}> {
  return refs.map((r) => ({
    type: r.type,
    id: r.id,
    task_id: r.taskId,
    label: r.label,
    detail: r.detail,
    ...(r.type === "output" ? { path: r.path, kind: r.kind, run_id: r.runId } : {}),
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
    if (type !== "task" && type !== "step" && type !== "artifact" && type !== "output") continue;
    const path = typeof o.path === "string" ? o.path : "";
    const id = type === "output" ? path : String(o.id || "").trim();
    if (!id) continue;
    const taskId = (o.task_id ?? o.taskId) as string | undefined;
    const common = {
      type,
      id,
      taskId: taskId ? String(taskId) : undefined,
      label: String(o.label || id).slice(0, 120),
      detail: o.detail != null ? String(o.detail).slice(0, 400) : undefined,
    };
    if (type === "output") out.push({ ...common, type, path, kind: typeof o.kind === "string" ? o.kind : undefined,
      runId: typeof (o.run_id ?? o.runId) === "string" ? String(o.run_id ?? o.runId) : undefined,
      mtime: typeof o.mtime === "number" ? o.mtime : undefined, size: typeof o.size === "number" ? o.size : undefined });
    else out.push({ ...common, type });
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
