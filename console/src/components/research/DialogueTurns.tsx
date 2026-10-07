import type {
  Conversation,
  DialogueTurn,
  ResearchLanguage,
} from "../../lib/research/types";
import { citationTarget } from "../../lib/research/core";
import { turnStates, dialogueError } from "../../lib/research/dialogue";
import { personaLabel } from "../../lib/research/copy";
import type { Copy } from "./shared";
export function DialogueTurns({
  conversation,
  turns,
  language,
  tr,
  onCitation,
}: {
  conversation: Conversation | null;
  turns: DialogueTurn[];
  language: ResearchLanguage;
  tr: Copy;
  onCitation: (path: string) => void;
}) {
  const round = conversation?.kind === "roundtable";
  return (
    <div
      className="research-dialogue-messages space-y-5 p-5"
      aria-label={tr("对话记录")}
      aria-live="polite"
    >
      {turns.map((turn) => (
        <section key={turn.id} className="space-y-3">
          <article className="rounded-md bg-surface-2 px-4 py-3">
            <small className="text-primary">{tr("你")}</small>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-heading">
              {turn.message}
            </p>
          </article>
          {round && (
            <p className="text-xs text-muted">
              {tr(turnStates[turn.state] || turn.state)}
            </p>
          )}
          {(round ? turn.speeches || [] : [turn]).map((speech, index) => {
            const persona = round
              ? conversation.participant_snapshots?.find(
                  (p) => p.id === speech.persona_id,
                )
              : conversation?.persona_snapshot;
            return (
              <article
                key={speech.persona_id || index}
                className="border-b border-border-solid px-1 pb-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong className="text-sm font-medium text-primary">
                    {personaLabel(persona, language)?.name ||
                      tr("投资思路模拟")}
                  </strong>
                  {round && (
                    <small className="text-muted">
                      {tr(turnStates[speech.state] || speech.state)}
                    </small>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-body leading-relaxed">
                  {speech.reply ||
                    (speech.error
                      ? tr(dialogueError(speech.error))
                      : tr(turnStates[speech.state] || speech.state))}
                </p>
                {speech.truncated && (
                  <p className="mt-2 text-xs text-muted">
                    {tr("回复超过显示上限，已截断。")}
                  </p>
                )}
                {speech.citation_warning && (
                  <p className="mt-2 text-xs text-spark-flare">
                    {tr(
                      "部分引用无法在绑定报告中核验，已移除对应链接；请结合原报告核对相关结论。",
                    )}
                  </p>
                )}
                {speech.history_coverage && (
                  <p className="mt-2 text-xs text-muted">
                    {tr(speech.history_coverage)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(speech.citations || []).map((id) => {
                    const path = citationTarget(conversation, id);
                    return path ? (
                      <button
                        key={id}
                        className="text-xs text-primary underline underline-offset-4"
                        onClick={() => onCitation(path)}
                      >
                        {tr("报告依据：")}
                        {conversation.sections.find((s) => s.id === id)?.title}
                      </button>
                    ) : null;
                  })}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
