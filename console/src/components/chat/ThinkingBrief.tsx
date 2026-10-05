import { useTranslation } from "react-i18next";
import { thinkingLines } from "../../lib/thinkingBrief";

/** One row per thought, the last row still growing. Same shape as Claude Code / Codex. */
export function ThinkingBrief({ text }: { text?: string }) {
  const { t } = useTranslation();
  const lines = thinkingLines(text || "");
  if (!lines.length) return null;
  return (
    <div className="mb-2 border-s border-border-solid ps-2" aria-live="polite">
      <div className="mb-0.5 text-[10px] uppercase tracking-widest text-muted">
        {t("dev.studio.chat.thinking")}
      </div>
      <div className="space-y-0.5 text-[12px] leading-snug text-muted">
        {lines.map((line, index) => <div key={index}>{line}</div>)}
      </div>
    </div>
  );
}
