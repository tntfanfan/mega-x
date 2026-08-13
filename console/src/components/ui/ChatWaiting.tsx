/**
 * Shared chat waiting / typing presence.
 *
 * Visual language matches Recruiter Studio: orbit mark, staggered dots,
 * label pulse, and a shimmer bar. CSS lives in styles/globals.css.
 */

export function TypingDots({
  label,
  dotClassName = "bg-primary",
}: {
  label?: string;
  dotClassName?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-muted"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="inline-flex items-end gap-[3px] h-3" aria-hidden>
        <span className={`chat-typing-dot block size-1 rounded-full ${dotClassName}`} />
        <span className={`chat-typing-dot block size-1 rounded-full ${dotClassName}`} />
        <span className={`chat-typing-dot block size-1 rounded-full ${dotClassName}`} />
      </span>
      {label ? <span className="chat-wait-pulse text-[11px]">{label}</span> : null}
    </span>
  );
}

export function ChatWaitingBubble({
  mark = "●",
  speaker,
  label,
}: {
  mark?: string;
  speaker: string;
  label?: string;
}) {
  return (
    <div
      className="recruiter-bubble-in max-w-[min(85%,28rem)] rounded-md px-3 py-2.5 text-xs leading-relaxed bg-surface border border-border-solid text-body shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)]"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-2.5">
        <span className="recruiter-wait-mark" aria-hidden>
          <span className="relative z-[1] text-[11px] font-semibold leading-none">
            {mark}
          </span>
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest recruiter-label-shimmer">
            {speaker}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-end gap-[3px] h-3" aria-hidden>
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
            </span>
            {label ? (
              <span className="chat-wait-pulse text-[11px] text-muted truncate">{label}</span>
            ) : null}
          </div>
          <div className="recruiter-wait-bar" aria-hidden>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Recruiter Studio waiting card — same motion, Recruiter branding. */
export function RecruiterWaiting({ label }: { label?: string }) {
  return <ChatWaitingBubble mark="R" speaker="Recruiter" label={label} />;
}

export function waitingMark(emoji?: string, name?: string): string {
  const em = (emoji || "").trim();
  if (em) return em;
  const ch = [...(name || "").trim()][0];
  return ch && ch !== "…" ? ch : "●";
}
