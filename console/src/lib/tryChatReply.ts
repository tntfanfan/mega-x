import type { ChatMsg } from "./builderFixtures";

type StoredTryChat = { session_id?: string; messages: ChatMsg[]; mode?: "recruiter" | "try" };

function storageKey(deptId: string): string {
  return `dev.tryChat.${deptId}`;
}

export function loadTryChat(deptId: string): StoredTryChat | null {
  try {
    const raw = localStorage.getItem(storageKey(deptId));
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredTryChat;
    if (!o || !Array.isArray(o.messages)) return null;
    return o;
  } catch {
    return null;
  }
}

export function saveTryChat(deptId: string, data: StoredTryChat): void {
  try {
    localStorage.setItem(storageKey(deptId), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function mergeTryHistory(current: ChatMsg[], incoming: ChatMsg[]): ChatMsg[] {
  if (incoming.length > current.length) return incoming;
  const have = new Set(current.map((m) => m.text));
  const extra = incoming.filter((m) => m.role === "copilot" && m.text && !have.has(m.text));
  return extra.length ? [...current, ...extra] : current;
}

export function turnsToMessages(turns: { role?: string; text?: string }[]): ChatMsg[] {
  return turns
    .filter((t) => (t.text || "").trim() && !isTryContinue(t.text || ""))
    .map((t, i) => ({
      id: `th-${i}-${t.role || "copilot"}`,
      role: t.role === "user" ? "user" : "copilot",
      text: (t.text || "").trim(),
    }));
}

export const TRY_CHAT_CONTINUE =
  "[TRY_CHAT_CONTINUE] 子代理已结束本轮。请立刻阅读最新 handoff 与 shared/artifacts，把用户能直接使用的内容完整贴到对话里，然后继续流水线。有可交付内容时必须先发给用户再 yield。不要等用户再问。";

export function isTryContinue(text: string): boolean {
  return text.trimStart().startsWith("[TRY_CHAT_CONTINUE]");
}

export type TryChatResponse = {
  ok: boolean;
  reply: string;
  session_id?: string;
  error?: string;
  yielded?: boolean;
};

/** Pull the assistant line out of an OpenClaw ``agent --json`` blob. */
export function extractTryReply(reply: unknown): string {
  if (reply && typeof reply === "object") {
    return fromBlob(reply as Record<string, unknown>) || "";
  }
  if (typeof reply !== "string") return "";
  const t = reply.trim();
  if (!t) return "";
  if (!t.startsWith("{")) return t;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === "object") {
      const text = fromBlob(parsed as Record<string, unknown>);
      if (text) return text;
      const o = parsed as Record<string, unknown>;
      const result = o.result && typeof o.result === "object"
        ? (o.result as Record<string, unknown>)
        : null;
      const meta = (result?.meta && typeof result.meta === "object"
        ? result.meta
        : o.meta && typeof o.meta === "object" ? o.meta : null) as Record<string, unknown> | null;
      if (meta?.yielded) return "部门正在处理子任务，完成后会把内容发过来。";
      if ("runId" in o || "systemPromptReport" in o || "payloads" in o) {
        return "这次没有返回可见回复，请再试一次。";
      }
    }
  } catch {
    /* not JSON — show as-is */
  }
  return t;
}

function fromBlob(o: Record<string, unknown>): string {
  const result = o.result && typeof o.result === "object"
    ? (o.result as Record<string, unknown>)
    : null;
  const payloads = (Array.isArray(o.payloads) ? o.payloads : null)
    ?? (result && Array.isArray(result.payloads) ? result.payloads : null);
  if (Array.isArray(payloads)) {
    for (const p of payloads) {
      if (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string") {
        const text = ((p as { text: string }).text || "").trim();
        if (text) return text;
      }
    }
  }
  const meta = (result?.meta && typeof result.meta === "object"
    ? result.meta
    : o.meta && typeof o.meta === "object" ? o.meta : null) as Record<string, unknown> | null;
  const vis = meta?.finalAssistantVisibleText;
  if (typeof vis === "string" && vis.trim()) return vis.trim();
  for (const key of ["reply", "text", "content"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim() && !v.trim().startsWith("{")) return v.trim();
  }
  return "";
}
