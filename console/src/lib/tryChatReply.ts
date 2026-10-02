import type { ChatMsg } from "./builderFixtures";
import { normalizeRefs, refKey } from "./chatRefs";

type StoredTryChat = { session_id?: string; messages: ChatMsg[]; mode?: "recruiter" | "try" };

export type TryChatSession = { session_id: string; title?: string; created_at?: number; updated_at?: number; is_default?: boolean };

export function selectedTrySession(draftId: string, selected?: string | null): string {
  const fallback = `try-${draftId}`;
  const suffix = selected?.startsWith(`${fallback}-`) ? selected.slice(fallback.length + 1) : "";
  return selected && (selected === fallback || /^[a-f0-9]{32}$/.test(suffix)) ? selected : fallback;
}

function storageKey(deptId: string): string {
  return `dev.tryChat.v2.${deptId}`;
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
  const merged = incoming.map((m) => ({ ...m }));
  const matched = new Set<number>();
  for (const old of current) {
    const index = merged.findIndex((m, i) =>
      !matched.has(i) && (m.clientMessageId && old.clientMessageId
        ? m.clientMessageId === old.clientMessageId
        : (!m.id.startsWith("th-") && m.id === old.id) || (m.role === old.role && m.text === old.text &&
          JSON.stringify((m.refs || []).map(refKey).sort()) === JSON.stringify((old.refs || []).map(refKey).sort()))) &&
      (!old.media?.length || !m.media?.length || old.media.some((url) => m.media?.includes(url))),
    );
    if (index < 0) {
      merged.push(old);
      continue;
    }
    matched.add(index);
    if (old.media?.length) {
      merged[index].media = [...new Set([...(merged[index].media || []), ...old.media])];
    }
  }
  return merged;
}

export type TryHistoryTurn = { label?: string; source?: "lead" | "sub"; role?: string; text?: string; media?: string[]; id?: string; refs?: unknown;
  client_message_id?: string; status?: string };

export function turnsToMessages(turns: TryHistoryTurn[]): ChatMsg[] {
  return turns
    .filter((t) => ((t.text || "").trim() || t.media?.length) && !isTryContinue(t.text || ""))
    .map((t, i) => ({
      id: t.id || `th-${i}-${t.role || "copilot"}`,
      role: t.role === "user" ? "user" : "copilot",
      text: (t.text || "").trim(),
      media: Array.isArray(t.media) ? t.media.filter((url) => typeof url === "string") : undefined,
      refs: normalizeRefs(t.refs),
      label: t.label,
      source: t.source,
      clientMessageId: t.client_message_id,
      status: t.status === "submitting" ? "delivery_unknown" :
        ["accepted", "failed", "delivery_unknown"].includes(t.status) ? t.status as ChatMsg["status"] : undefined,
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

function looksLikeReport(t: string): boolean {
  const head = t.slice(0, 800);
  return (
    head.includes('"runId"') ||
    head.includes("'runId'") ||
    head.includes('"systemPromptReport"') ||
    head.includes("'systemPromptReport'") ||
    head.includes('"payloads"') ||
    head.includes("'payloads'")
  );
}

function unescapePy(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\"/g, '"');
}

/** Python ``str(dict)`` / JSON — pull the spoken line out of an OpenClaw dump. */
function fromReportString(t: string): string {
  const vis = /['"]finalAssistantVisibleText['"]\s*:\s*['"]((?:\\.|[^'"])*)['"]/.exec(t);
  if (vis?.[1]) return unescapePy(vis[1]).trim();
  const pay = /['"]payloads['"][\s\S]{0,120}['"]text['"]\s*:\s*['"]((?:\\.|[^'"])*)['"]/.exec(t);
  if (pay?.[1]) return unescapePy(pay[1]).trim();
  return "";
}

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
    const scraped = fromReportString(t);
    if (scraped) return scraped;
    if (looksLikeReport(t)) return "这次没有返回可见回复，请再试一次。";
  }
  if (looksLikeReport(t)) {
    return fromReportString(t) || "这次没有返回可见回复，请再试一次。";
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
  for (const blob of [result, o]) {
    if (!blob) continue;
    for (const key of ["finalAssistantVisibleText", "finalAssistantRawText"] as const) {
      const vis = blob[key];
      if (typeof vis === "string" && vis.trim()) return vis.trim();
    }
    const meta = blob.meta && typeof blob.meta === "object"
      ? (blob.meta as Record<string, unknown>)
      : null;
    const vis = meta?.finalAssistantVisibleText;
    if (typeof vis === "string" && vis.trim()) return vis.trim();
  }
  for (const key of ["reply", "text", "content"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) {
      if (looksLikeReport(v)) {
        const nested = extractTryReply(v);
        if (nested && nested !== v) return nested;
        continue;
      }
      return v.trim();
    }
  }
  return "";
}
