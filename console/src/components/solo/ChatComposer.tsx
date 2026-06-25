/**
 * ChatComposer — Solo 端"派活"输入框。
 *
 * 极简：一个 textarea + 发送按钮。Enter 发送，Shift+Enter 换行。
 * 输入框内输入 @ 会触发简单的队友建议（S6 不做完整 @-mention 解析，
 * 暂时只是视觉占位）。
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  onSend: (text: string) => void;
  sending?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSend, sending, placeholder }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // 自动撑高
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-md border border-border-solid bg-surface p-3 space-y-2">
      <div className="flex items-start gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder ?? t("solo.line.composer.placeholder")}
          disabled={sending}
          rows={1}
          className="flex-1 bg-transparent text-sm text-body resize-none outline-none placeholder:text-dim leading-relaxed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || sending}
          className="shrink-0 rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? "…" : t("solo.line.composer.send")}
        </button>
      </div>
      <p className="text-[10px] text-muted leading-relaxed">
        {t("solo.line.composer.hint")}
      </p>
    </div>
  );
}
