import { useEffect, useRef, useState } from "react";
import {
  availablePersonas,
  schools,
  schoolOf,
} from "../../lib/research/catalog";
import { dialogueCanSend, dialogueError } from "../../lib/research/dialogue";
import { dateLabel, personaLabel } from "../../lib/research/copy";
import type { ResearchLanguage } from "../../lib/research/types";
import type { ResearchDialogueState } from "../../hooks/useResearchDialogue";
import { DialogueTurns } from "./DialogueTurns";
import {
  Section,
  buttonClass,
  primaryClass,
  inputClass,
  type Copy,
} from "./shared";
export function ResearchDialogue({
  dialogue,
  language,
  tr,
  onPreview,
  active = true,
  showModeSwitch = true,
}: {
  dialogue: ResearchDialogueState;
  language: ResearchLanguage;
  tr: Copy;
  onPreview: (path: string) => void;
  active?: boolean;
  showModeSwitch?: boolean;
}) {
  const [school, setSchool] = useState("all"),
    input = useRef<HTMLTextAreaElement>(null),
    list = availablePersonas(dialogue.personas, language),
    groups = schools.filter((g) => list.some((p) => schoolOf(p) === g.id)),
    filter = groups.some((g) => g.id === school) ? school : "all";
  const round = dialogue.kind === "roundtable",
    conversation = dialogue.conversation,
    binding = conversation?.report || dialogue.report;
  const profiles =
    (conversation?.kind === "roundtable"
      ? conversation.participant_snapshots
      : dialogue.personas.filter((p) =>
          dialogue.participants.includes(p.id),
        )) || [];
  const persona = personaLabel(
    conversation?.persona_snapshot ||
      dialogue.personas.find((p) => p.id === dialogue.persona),
    language,
  );
  const history = dialogue.conversations.filter((c) =>
    round
      ? c.kind === "roundtable"
      : c.kind !== "roundtable" && c.persona_snapshot?.id === dialogue.persona,
  );
  const enabled = dialogueCanSend({
    ...dialogue,
    can_send: dialogue.capability.can_send,
    generating: dialogue.turns.some((t) =>
      ["accepted", "running"].includes(t.state),
    ),
  });
  useEffect(() => {
    if (active) input.current?.focus({ preventScroll: true });
  }, [active, dialogue.cid, dialogue.persona, dialogue.kind]);
  return (
    <Section
      id="dialogue"
      title={tr(round ? "投资圆桌" : "人物对话")}
      description={tr("选择一种投资思路，讨论问题或追问研究报告。")}
      action={
        <span className="text-xs text-muted">
          {tr("投资思路模拟，非本人观点")}
        </span>
      }
    >
      {showModeSwitch && <div className="flex flex-wrap gap-2 px-5 pt-5">
        {[
          ["single", "单人对话"],
          ["roundtable", "投资圆桌"],
        ].map(([kind, label]) => (
          <button
            key={kind}
            className={`${buttonClass} ${dialogue.kind === kind ? "border-primary text-primary" : ""}`}
            aria-pressed={dialogue.kind === kind}
            disabled={dialogue.busy}
            onClick={() => dialogue.selectMode(kind as "single" | "roundtable")}
          >
            {tr(label)}
          </button>
        ))}
      </div>}
      {round && (
        <p className="px-5 pt-3 text-xs text-muted">
          {tr(
            "选择 2～4 位人物，按下方顺序发言。每轮每位人物各回答一次，人数越多等待时间和模型用量越高。",
          )}
          {dialogue.cid && tr("本圆桌成员已固定；更换成员请新建圆桌。")}
        </p>
      )}
      <label className="flex max-w-sm items-center gap-3 px-5 py-4 text-sm text-body">
        {tr("筛选流派")}
        <select
          className={inputClass}
          value={filter}
          onChange={(e) => setSchool(e.target.value)}
        >
          <option value="all">{tr("全部流派")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name[language]}
            </option>
          ))}
        </select>
      </label>
      <div
        className="research-role-list grid gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label={tr("选择投资人物")}
      >
        {list
          .filter((p) => filter === "all" || schoolOf(p) === filter)
          .map((p) => {
            const profile = personaLabel(p, language),
              selected = round
                ? dialogue.participants.includes(p.id)
                : dialogue.persona === p.id,
              style = `rounded-md border p-3 text-start ${selected ? "border-primary/60 bg-primary-muted" : "border-border-solid bg-surface-2"}`;
            return round ? (
              <label key={p.id} className={`${style} flex items-start gap-2`}>
                <input
                  className="mt-1 accent-primary"
                  type="checkbox"
                  checked={selected}
                  disabled={
                    !!dialogue.cid ||
                    dialogue.busy ||
                    (!selected && dialogue.participants.length >= 4)
                  }
                  aria-label={profile.name}
                  onChange={(e) =>
                    dialogue.toggleParticipant(p.id, e.target.checked)
                  }
                />
                <span>
                  <strong className="block text-sm font-medium text-heading">
                    {profile.name}
                  </strong>
                  <small className="mt-1 block text-muted">
                    {profile.summary}
                  </small>
                </span>
              </label>
            ) : (
              <button
                key={p.id}
                className={style}
                aria-pressed={selected}
                disabled={dialogue.busy}
                onClick={() => dialogue.selectPersona(p.id)}
              >
                <strong className="block text-sm font-medium text-heading">
                  {profile.name}
                </strong>
                <small className="mt-1 block text-muted">
                  {profile.summary}
                </small>
              </button>
            );
          })}
      </div>
      {(dialogue.error || !dialogue.capability.can_send) && (
        <p role="status" className="px-5 pb-4 text-sm text-spark-flare">
          {tr(
            dialogue.error ||
              dialogueError(dialogue.capability.reason) ||
              "暂时无法发送",
          )}
        </p>
      )}
      <div className="grid border-t border-border-solid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-border-solid p-4 lg:border-b-0 lg:border-e">
          <button
            className={`${buttonClass} w-full`}
            disabled={dialogue.busy || dialogue.loading}
            onClick={dialogue.newConversation}
          >
            {tr(round ? "＋ 新建圆桌" : "＋ 新建自由对话")}
          </button>
          <nav aria-label={tr("对话记录")} className="mt-3 space-y-2">
            {history.length ? (
              history.map((c) => (
                <button
                  key={c.id}
                  className={`w-full rounded-md p-3 text-start hover:bg-surface-2 ${dialogue.cid === c.id ? "bg-surface-2" : ""}`}
                  aria-pressed={dialogue.cid === c.id}
                  disabled={dialogue.busy}
                  onClick={() => void dialogue.openConversation(c.id)}
                >
                  <span className="block break-words text-sm text-heading">
                    {c.title}
                  </span>
                  <small className="mt-1 block text-muted">
                    {tr(c.mode === "report" ? "报告对话" : "自由对话")} ·{" "}
                    {dateLabel(c.updated_at, language)}
                  </small>
                </button>
              ))
            ) : (
              <p className="p-2 text-xs text-muted">
                {tr(round ? "还没有圆桌讨论。" : "此角色还没有对话。")}
              </p>
            )}
          </nav>
          {dialogue.hasMore && (
            <button
              className={`${buttonClass} mt-3`}
              onClick={() => void dialogue.loadMore()}
            >
              {tr("加载更多会话")}
            </button>
          )}
        </aside>
        <div className="min-w-0">
          <div className="border-b border-border-solid px-5 py-4">
            <h3 className="text-base text-heading">
              {round
                ? tr("投资圆桌 · ") +
                  profiles
                    .map((p) => personaLabel(p, language).name)
                    .join(language === "en" ? ", " : "、")
                : persona
                  ? tr`${persona.name} · 方法版本 ${persona.version || "—"}`
                  : tr("选择角色")}
            </h3>
            {binding ? (
              <>
                <p className="mt-2 text-xs text-muted">{tr`报告对话 · ${conversation?.evidence?.ticker || binding.task_id} · 固定版本 ${binding.run_id}`}</p>
                {conversation?.evidence && (
                  <>
                    <p className="mt-1 text-xs text-muted">
                      {tr("报告时间 ")}
                      {dateLabel(
                        conversation.evidence.generated_at,
                        language,
                      )}{" "}
                      · {conversation.evidence.currency}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {tr(conversation.evidence.coverage || "")}
                      {conversation.evidence.omitted_sections?.length
                        ? tr("未完整纳入：") +
                          conversation.evidence.omitted_sections.join("、")
                        : ""}
                    </p>
                  </>
                )}
                <button
                  className={`${buttonClass} mt-3`}
                  onClick={() =>
                    onPreview(
                      `tasks/${binding.task_id}/runs/${binding.run_id}/final/report.html`,
                    )
                  }
                >
                  {tr("查看绑定报告")}
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">
                {tr("自由对话 · 未绑定研究报告，没有实时行情。")}
              </p>
            )}
          </div>
          {!dialogue.turns.length && (
            <p className="p-5 text-sm text-muted">
              {tr(
                binding
                  ? "发送问题后将创建绑定此版本报告的新对话。"
                  : "从你关心的问题开始。每个角色的对话独立保存。",
              )}
            </p>
          )}
          <DialogueTurns
            conversation={conversation}
            turns={dialogue.turns}
            {...{ language, tr }}
            onCitation={onPreview}
          />
          <form
            className="border-t border-border-solid p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void dialogue.send();
            }}
          >
            <label className="text-sm text-body">
              {tr("你的问题")}
              <textarea
                ref={input}
                className={`${inputClass} mt-2 min-h-24 resize-y`}
                value={dialogue.message}
                onChange={(e) => dialogue.setMessage(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={tr("例如：判断一家公司的护城河，需要哪些证据？")}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.ctrlKey || e.metaKey) &&
                    enabled
                  ) {
                    e.preventDefault();
                    void dialogue.send();
                  }
                }}
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-mono text-muted">
                {dialogue.message.length} / 4000
              </span>
              <button
                className={primaryClass}
                type="submit"
                disabled={!enabled}
              >
                {tr(dialogue.busy ? "正在发送，请稍候。" : "发送问题")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Section>
  );
}
