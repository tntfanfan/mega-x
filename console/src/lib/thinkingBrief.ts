/** Growing thought line, then each finished line. Not part of the answer. */

export function applyThinking(
  current: string,
  text: string,
  opts?: { open?: boolean; replace?: boolean },
): string {
  if (opts?.replace && !text) return "";
  const next = text.trim();
  if (!next) return current;
  const base = opts?.replace ? "" : current.replace(/[^\n]*$/, "");
  if (opts?.open) return base + next;
  return `${base}${next}\n`;
}

export function thinkingLines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function isEmptyCopilot(message: {
  role: string;
  text?: string;
  media?: string[];
  thinking?: string;
}): boolean {
  return message.role === "copilot" && !message.text && !message.media?.length && !message.thinking;
}
