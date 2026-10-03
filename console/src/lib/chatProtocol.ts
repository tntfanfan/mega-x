/** Task-machine blocks belong to the platform, not the chat transcript. */

const MACHINE = new Set([
  "questions", "plan", "step_result", "run_result", "replan_request", "acceptance_result", "suggest_task",
]);

const FENCE = /```(?:lgh|json)\s*\n([\s\S]*?)```/gi;
const OPEN_TAIL = /```(?:lgh|json)\s*\n[\s\S]*$/i;

function payloadKind(raw: string): { kind: string; payload: Record<string, unknown> } | null {
  try {
    const payload = JSON.parse(raw) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const kind = (payload as { type?: unknown }).type;
    if (typeof kind !== "string" || !MACHINE.has(kind)) return null;
    return { kind, payload: payload as Record<string, unknown> };
  } catch {
    return null;
  }
}

function questionLines(payload: Record<string, unknown>): string[] {
  const questions = payload.questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((question) => {
    if (!question || typeof question !== "object") return [];
    const text = (question as { text?: unknown }).text;
    return typeof text === "string" && text.trim() ? [text.trim()] : [];
  });
}

/** Hide ```lgh protocol fences. Keep real question text when the prose omits it. */
export function stripChatProtocol(text: string): string {
  const surfaced: string[] = [];
  const withoutFences = text.replace(FENCE, (full, raw: string) => {
    const found = payloadKind(String(raw).trim());
    if (!found) return full;
    if (found.kind === "questions") surfaced.push(...questionLines(found.payload));
    return "";
  });
  const lines = OPEN_TAIL.test(withoutFences) ? withoutFences.replace(OPEN_TAIL, "").split("\n") : withoutFences.split("\n");
  const kept = lines.filter((line) => {
    const bare = line.trim();
    if (!bare.startsWith("{") || !bare.endsWith("}")) return true;
    const found = payloadKind(bare);
    if (!found) return true;
    if (found.kind === "questions") surfaced.push(...questionLines(found.payload));
    return false;
  });
  let cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const missing = [...new Set(surfaced.filter((asked) => !cleaned.includes(asked)))];
  if (missing.length) {
    const block = missing.map((asked) => `- ${asked}`).join("\n");
    cleaned = cleaned ? `${cleaned}\n\n${block}` : block;
  }
  return cleaned;
}

export type ChatSegment =
  | { kind: "text"; text: string }
  | { kind: "aside"; label: string; text: string };

const DETAILS_BLOCK = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
const DETAILS_OPEN = /<details\b[^>]*>([\s\S]*)$/i;
const SUMMARY_BLOCK = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i;
const TAG = /<\/?(?:details|summary)\b[^>]*>/gi;

function tidy(text: string): string {
  return text.replace(TAG, "").replace(/\n{3,}/g, "\n\n").trim();
}

function asideInner(inner: string): { label: string; text: string } {
  const summary = SUMMARY_BLOCK.exec(inner);
  return {
    label: summary ? tidy(summary[1]) : "",
    text: tidy(inner.replace(SUMMARY_BLOCK, "")),
  };
}

function pushText(segments: ChatSegment[], raw: string) {
  const text = tidy(raw);
  if (text) segments.push({ kind: "text", text });
}

/** Main reply stays prose. `<details>` becomes a trailing note, in source order. */
export function chatSegments(raw: string): ChatSegment[] {
  const text = stripChatProtocol(raw);
  const segments: ChatSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(DETAILS_BLOCK)) {
    const index = match.index ?? 0;
    pushText(segments, text.slice(cursor, index));
    const aside = asideInner(match[1]);
    if (aside.label || aside.text) segments.push({ kind: "aside", ...aside });
    cursor = index + match[0].length;
  }
  const rest = text.slice(cursor);
  const open = DETAILS_OPEN.exec(rest);
  if (open && open.index !== undefined) {
    pushText(segments, rest.slice(0, open.index));
    const aside = asideInner(open[1]);
    if (aside.label || aside.text) segments.push({ kind: "aside", ...aside });
  } else {
    pushText(segments, rest);
  }
  if (segments.length && segments.every(segment => segment.kind === "aside")) {
    return segments.flatMap(segment => {
      if (segment.kind !== "aside") return [];
      const promoted: ChatSegment[] = [];
      if (segment.label) promoted.push({ kind: "aside", label: segment.label, text: "" });
      if (segment.text) promoted.push({ kind: "text", text: segment.text });
      return promoted;
    });
  }
  return segments;
}
