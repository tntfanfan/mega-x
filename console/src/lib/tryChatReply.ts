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
      if (meta?.yielded) return "部门正在把任务派给子代理，请稍后再问进度。";
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
