import { useEffect, useState } from "react";
import { Check, CornerDownLeft, PenLine } from "lucide-react";
import { ASK_DECIDE, askQuestions } from "../api";
import type { Ask, AskAnswer, AskQuestion } from "../api";
import { isTyping } from "./bits";

const EMPTY: AskAnswer = { choices: [] };

function answered(a: AskAnswer | undefined): boolean {
  return Boolean(a && (a.choices.length || a.text?.trim()));
}

/** The answer message (answerText) back into per-question choices, to show what was picked. */
function parseAnswer(questions: AskQuestion[], text: string): string[][] {
  const split = (s: string) => s.split("、").map(x => x.trim()).filter(Boolean);
  if (questions.length === 1) return [split(text)];
  const lines = text.split("\n");
  return questions.map(q => {
    const head = `${q.header || q.question}：`;
    const line = lines.find(l => l.startsWith(head));
    return line ? split(line.slice(head.length)) : [];
  });
}

/**
 * `mcp__ui__ask` 的问题卡片。每题是选项 +「你定」+「其他（自己写）」。
 * 只有一题且单选时，点一下就发；否则每题选完后点「提交」，一条消息发回。
 * 正在等回答的卡片可以用数字键 1–9 选、Enter 提交；答过的卡片显示当时选了什么。
 */
export function AskCard({ ask, answerable, answer, onAnswer }: {
  ask: Ask;
  answerable: boolean;
  /** The user's reply to this ask, once there is one. */
  answer?: string;
  onAnswer: (ask: Ask, answers: AskAnswer[]) => boolean;
}) {
  const questions = askQuestions(ask);
  const [answers, setAnswers] = useState<AskAnswer[]>(() => questions.map(() => EMPTY));
  const [other, setOther] = useState<boolean[]>(() => questions.map(() => false));
  const instant = questions.length === 1 && !questions[0].multi;
  const done = questions.filter((_, i) => answered(answers[i])).length;
  const chosen = answer !== undefined ? parseAnswer(questions, answer) : null;
  const active = answerable && !chosen;

  const update = (i: number, next: AskAnswer) => setAnswers(list => list.map((a, j) => (j === i ? next : a)));
  const send = (next: AskAnswer[]) => {
    if (next.every(answered)) onAnswer(ask, next);
  };

  const pick = (i: number, q: AskQuestion, label: string) => {
    const current = answers[i] || EMPTY;
    let choices: string[];
    if (label === ASK_DECIDE || !q.multi) {
      choices = current.choices.length === 1 && current.choices[0] === label ? [] : [label];
    } else {
      const rest = current.choices.filter(c => c !== ASK_DECIDE);
      choices = rest.includes(label) ? rest.filter(c => c !== label) : [...rest, label];
    }
    // 单选时，点选项就放弃「其他」里写的话；多选可以两者都要。
    const next = { choices, text: q.multi && label !== ASK_DECIDE ? current.text : undefined };
    if (!q.multi || label === ASK_DECIDE) setOther(list => list.map((o, j) => (j === i ? false : o)));
    if (instant) { if (choices.length) send([next]); return; }
    update(i, next);
  };

  const write = (i: number, q: AskQuestion, text: string) => {
    const current = answers[i] || EMPTY;
    update(i, { choices: q.multi ? current.choices.filter(c => c !== ASK_DECIDE) : [], text });
  };

  // 1–9 picks in the first question still open (or the only one); Enter submits when every question has an answer.
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" && !instant && done === questions.length) { e.preventDefault(); send(answers); return; }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const i = questions.length === 1 ? 0 : Math.max(0, answers.findIndex(a => !answered(a)));
      const q = questions[i];
      const labels = [...q.options.map(o => o.label), ASK_DECIDE];
      if (n <= labels.length) { e.preventDefault(); pick(i, q, labels[n - 1]); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (!questions.length) return null;

  // 答过的卡片收成一行一题：问题 → 选了什么，别再占一大块地方。
  if (chosen) {
    return (
      <div className="mt-3 space-y-1.5 rounded-xl border border-border-solid bg-surface/40 px-3 py-2.5">
        {questions.map((q, i) => (
          <div key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="min-w-0 text-muted">{q.header || q.question}</span>
            <span className="flex min-w-0 flex-wrap gap-1">
              {(chosen[i] || []).length ? chosen[i].map(c => (
                <span key={c} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-px text-xs text-heading">
                  <Check size={11} aria-hidden className="text-primary" />{c}
                </span>
              )) : <span className="text-xs text-dim">—</span>}
            </span>
          </div>
        ))}
        <p className="flex items-center gap-1 pt-0.5 text-[11px] text-dim"><Check size={12} aria-hidden className="text-spark-mint" />已回答</p>
      </div>
    );
  }

  const chip = (selected: boolean, block: boolean) =>
    `group/opt inline-flex items-start gap-2 rounded-lg border text-left text-sm transition-all ${block ? "w-full px-3 py-2" : "px-3 py-1.5"} ${selected
      ? "border-primary bg-primary/15 text-heading"
      : "border-border-solid bg-surface text-body hover:border-primary/70 hover:bg-primary/5 hover:text-heading"} disabled:cursor-default`;
  const badge = (n: number, selected: boolean) => active
    ? <kbd className={`mt-px inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 font-mono text-[10px] ${selected ? "border-primary/60 text-primary" : "border-border-solid text-dim group-hover/opt:text-primary"}`}>{n}</kbd>
    : null;

  return (
    <div className={`mt-3 space-y-4 rounded-xl border p-3 ${active ? "border-primary/30 bg-primary/[0.04] shadow-[0_0_0_1px_rgba(212,168,78,0.05)]" : "border-border-solid bg-surface/40"}`}>
      {questions.map((q, i) => {
        const a = answers[i] || EMPTY;
        const writing = other[i];
        const block = q.options.some(o => o.description);
        const isOn = (label: string) => a.choices.includes(label);
        return (
          <fieldset key={i} disabled={!active} className="min-w-0">
            <legend className="mb-2 text-sm text-heading">
              {questions.length > 1 && <span className="me-1.5 text-[11px] text-muted">{i + 1}/{questions.length}{q.header ? ` · ${q.header}` : ""}</span>}
              {q.question}
              {q.multi && <span className="ms-1 text-[11px] text-muted">（可多选）</span>}
            </legend>
            <div className={block ? "space-y-1.5" : "flex flex-wrap gap-1.5"}>
              {q.options.map((o, n) => (
                <button key={o.label} type="button" aria-pressed={isOn(o.label)} onClick={() => pick(i, q, o.label)}
                  className={chip(isOn(o.label), block)}>
                  {badge(n + 1, isOn(o.label))}
                  <span className="min-w-0">
                    <span className="block">{o.label}</span>
                    {o.description && <span className="mt-0.5 block text-xs text-muted">{o.description}</span>}
                  </span>
                </button>
              ))}
              <div className={block ? "flex gap-1.5 pt-0.5" : "contents"}>
                <button type="button" aria-pressed={isOn(ASK_DECIDE)} title="用默认值，或由主创判断"
                  onClick={() => pick(i, q, ASK_DECIDE)} className={chip(isOn(ASK_DECIDE), false)}>
                  {badge(q.options.length + 1, isOn(ASK_DECIDE))}{ASK_DECIDE}
                </button>
                <button type="button" aria-pressed={writing}
                  onClick={() => setOther(list => list.map((o, j) => (j === i ? !o : o)))}
                  className={chip(writing || Boolean(a.text?.trim()), false)}>
                  <PenLine size={13} aria-hidden className="mt-0.5" />自己写…
                </button>
              </div>
            </div>
            {writing && active && (
              <div className="mt-2 flex gap-2 animate-in fade-in slide-in-from-top-1">
                <input autoFocus aria-label={`${q.header || q.question}：自己写`} value={a.text || ""}
                  onChange={e => write(i, q, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (instant) send([answers[i]]);
                      else if (done === questions.length) send(answers);
                    }
                  }}
                  placeholder="写下你的想法，Enter 确定"
                  className="min-w-0 flex-1 rounded-md border border-border-solid bg-surface px-2.5 py-1.5 text-sm text-body outline-none focus:border-primary/60" />
                {instant && <button type="button" disabled={!a.text?.trim()} onClick={() => send([a])}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">发送</button>}
              </div>
            )}
          </fieldset>
        );
      })}
      {!instant ? (
        <div className="flex items-center justify-end gap-3">
          <span className="text-[11px] tabular-nums text-muted">已答 {done}/{questions.length}</span>
          <button type="button" disabled={!active || done < questions.length} onClick={() => send(answers)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:bg-accent disabled:opacity-40">
            提交<CornerDownLeft size={12} aria-hidden />
          </button>
        </div>
      ) : active ? (
        <p className="text-[11px] text-dim">按数字键直接选，也可以在下面的输入框里用自己的话回答</p>
      ) : null}
    </div>
  );
}
