import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ChatMsg } from "../../lib/builderFixtures";
import { Markdown } from "../ui/Markdown";
import { RecruiterWaiting, TypingDots } from "../ui/ChatWaiting";

export type ChatMode = "recruiter" | "try";

export function VibeChat({
  width, mode, onModeChange, canTry, tryDisabledReason, deptLabel,
  messages, onSend, onCancel, busy, toolStatus,
  composeSeed, onComposeSeedConsumed, onSendToRecruiter,
  recruiterEmptyKey,
}: {
  width: number;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  canTry: boolean;
  tryDisabledReason: string;
  deptLabel: string;
  messages: ChatMsg[];
  onSend: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  toolStatus: string | null;
  composeSeed?: string | null;
  onComposeSeedConsumed?: () => void;
  onSendToRecruiter?: (snippet: string) => void;
  recruiterEmptyKey?: string;
}) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<Record<ChatMode, string>>({
    recruiter: "",
    try: "",
  });
  const input = inputs[mode];
  const setInput = (value: string) =>
    setInputs((cur) => (cur[mode] === value ? cur : { ...cur, [mode]: value }));
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMsg = messages[messages.length - 1];
  const waitingForReply = busy && (!lastMsg || lastMsg.role !== "copilot" || !lastMsg.text);
  const isTry = mode === "try";
  const recruiterLabel = t("dev.studio.chat.mode-recruiter");
  const assistantLabel = isTry ? deptLabel : recruiterLabel;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMsg?.text, busy, toolStatus, waitingForReply, mode]);

  useEffect(() => {
    if (!composeSeed || mode !== "recruiter") return;
    setInputs((cur) => ({ ...cur, recruiter: composeSeed }));
    onComposeSeedConsumed?.();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    });
  }, [composeSeed, onComposeSeedConsumed, mode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    if (isTry && !canTry) return;
    onSend(text);
    setInput("");
  };

  const waitingLabel = isTry
    ? t("dev.studio.chat.try-waiting")
    : toolStatus
      ? t("dev.studio.chat.tool-running", { tool: toolStatus })
      : t("dev.studio.chat.waiting");

  const placeholder = isTry
    ? t("dev.studio.chat.try-placeholder")
    : t("dev.studio.chat.placeholder");

  return (
    <aside
      style={{ width }}
      className="shrink-0 border-s border-border-solid flex flex-col min-h-0 bg-surface/40"
    >
      <div className="px-3 py-2 border-b border-border-solid shrink-0 flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border-solid p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onModeChange("recruiter")}
            className={`rounded px-2.5 py-1 transition ${
              !isTry
                ? "bg-primary text-bg"
                : "text-muted hover:text-body"
            }`}
          >
            {t("dev.studio.chat.mode-recruiter")}
          </button>
          <button
            type="button"
            disabled={!canTry && !isTry}
            title={canTry ? t("dev.studio.chat.mode-try-hint") : tryDisabledReason}
            onClick={() => {
              if (!canTry) return;
              onModeChange("try");
            }}
            className={`rounded px-2.5 py-1 transition ${
              isTry
                ? "bg-primary text-bg"
                : "text-muted hover:text-body disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {t("dev.studio.chat.mode-try")}
          </button>
        </div>
        {busy && (
          <span className="ms-auto">
            <TypingDots label={waitingLabel} />
          </span>
        )}
      </div>
      {isTry ? (
        <div className="px-4 py-1.5 border-b border-border-solid text-[11px] text-muted shrink-0">
          {t("dev.studio.chat.try-banner")}
        </div>
      ) : (
        <div className="px-4 py-1.5 border-b border-border-solid text-[11px] text-muted shrink-0">
          {t("dev.studio.chat.recruiter-banner")}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.length === 0 && !busy && (
          <p className="text-[11px] text-muted leading-relaxed">
            {isTry
              ? t("dev.studio.chat.try-empty")
              : t(recruiterEmptyKey || "dev.studio.chat.recruiter-empty")}
          </p>
        )}
        {messages.map((m) => {
          if (m.role === "copilot" && !m.text) {
            if (!busy) return null;
            return (
              <div key={m.id} className="flex justify-start">
                {isTry ? (
                  <div className="max-w-[85%] rounded-md px-3 py-2 text-xs bg-surface border border-border-solid">
                    <div className={`text-[10px] uppercase tracking-widest mb-1 ${
                      m.source === "sub" ? "text-spark-blue" : "text-spark-mint"
                    }`}>
                      {m.label || assistantLabel}
                    </div>
                    <TypingDots label={waitingLabel} />
                  </div>
                ) : (
                  <RecruiterWaiting label={waitingLabel} speaker={recruiterLabel} />
                )}
              </div>
            );
          }
          return (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-surface-2 text-body whitespace-pre-wrap"
                  : "recruiter-bubble-in bg-surface border border-border-solid text-body"
              }`}>
                {m.role === "copilot" ? (
                  <>
                    <div className={`text-[10px] uppercase tracking-widest mb-1 ${
                      isTry
                        ? (m.source === "sub" ? "text-spark-blue" : "text-spark-mint")
                        : "text-primary"
                    }`}>
                      {m.label || assistantLabel}
                    </div>
                    {m.text ? <Markdown text={m.text} /> : null}
                    {isTry && m.text && onSendToRecruiter && (
                      <button
                        type="button"
                        onClick={() => onSendToRecruiter(m.text)}
                        className="mt-2 text-[10px] text-primary hover:underline"
                      >
                        {t("dev.studio.chat.send-to-recruiter")}
                      </button>
                    )}
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          );
        })}
        {waitingForReply && lastMsg?.role === "user" && (
          <div className="flex justify-start">
            {isTry ? (
              <div className="max-w-[85%] rounded-md px-3 py-2 text-xs bg-surface border border-border-solid">
                <div className="text-[10px] uppercase tracking-widest text-spark-mint mb-1">
                  {assistantLabel}
                </div>
                <TypingDots label={waitingLabel} />
              </div>
            ) : (
              <RecruiterWaiting label={waitingLabel} speaker={recruiterLabel} />
            )}
          </div>
        )}
        {busy && toolStatus && lastMsg?.role === "copilot" && lastMsg.text && (
          <div className="text-[11px] text-muted px-1 flex items-center gap-1.5">
            <span className="chat-wait-pulse inline-block size-1.5 rounded-full bg-spark-flare" aria-hidden />
            <span>{t("dev.studio.chat.tool-running", { tool: toolStatus })}</span>
          </div>
        )}
      </div>
      <div className="border-t border-border-solid p-3 shrink-0">
        <form onSubmit={submit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
            placeholder={isTry && !canTry ? tryDisabledReason : placeholder}
            disabled={busy || (isTry && !canTry)}
            rows={input.includes("\n") || input.length > 80 ? 5 : 2}
            className="flex-1 min-h-[2.5rem] max-h-40 resize-y bg-surface border border-border-solid rounded px-3 py-1.5 text-sm text-body placeholder:text-dim focus:border-primary outline-none disabled:opacity-60"
          />
          {busy ? (
            <button type="button" onClick={onCancel} className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-fusion hover:text-fusion shrink-0">
              {t("dev.studio.chat.cancel")}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isTry && !canTry}
              className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition shrink-0 disabled:opacity-50"
            >
              {t("dev.studio.chat.send")}
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
