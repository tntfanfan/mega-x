/**
 * Which assistant bubble still holds the question the page is waiting on.
 *
 * One turn can persist two bubbles: the lead asks, then a subagent (video
 * batch) appends a bubble that only carries the clip. That tail must not
 * close the question. A later reply that has text or an error does, and so
 * does anything the user sent afterwards. Asks already stored on the same
 * bubble as their pictures stay the open question, the same as before.
 */

export type AskTarget = {
  role: "user" | "assistant";
  text?: string;
  asks?: { id?: string }[];
  error?: string;
  pending?: boolean;
  live?: boolean;
};

export function openAskBubble<T extends AskTarget>(items: T[]): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const bubble = items[i];
    if (bubble.live) continue;
    if (bubble.role === "user") return undefined;
    if (bubble.asks?.length) return bubble.asks.some(ask => ask.id) ? bubble : undefined;
    if ((bubble.text || "").trim() || bubble.error) return undefined;
  }
  return undefined;
}

/** Same gate the card uses: id, idle connection, and this bubble is the open question (or still streaming). */
export function askIsAnswerable(
  bubble: AskTarget,
  ask: { id?: string },
  opts: { busy: boolean; connected: boolean; question: AskTarget | undefined },
): boolean {
  return Boolean(ask.id) && !opts.busy && opts.connected && (Boolean(bubble.live) || bubble === opts.question);
}
