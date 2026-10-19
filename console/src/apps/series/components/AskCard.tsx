import { useState } from "react";
import { ASK_DECIDE, askQuestions } from "../api";
import type { Ask, AskAnswer, AskQuestion } from "../api";

const EMPTY: AskAnswer = { choices: [] };

function answered(a: AskAnswer | undefined): boolean {
  return Boolean(a && (a.choices.length || a.text?.trim()));
}

/**
 * `mcp__ui__ask` 的问题卡片。每题是选项 +「你定」+「其他（自己写）」。
 * 只有一题且单选时，点一下就发；否则每题选完后点「提交」，一条消息发回。
 */
export function AskCard({ ask, answerable, onAnswer }: {
  ask: Ask;
  answerable: boolean;
  onAnswer: (ask: Ask, answers: AskAnswer[]) => boolean;
}) {
  const questions = askQuestions(ask);
  const [answers, setAnswers] = useState<AskAnswer[]>(() => questions.map(() => EMPTY));
  const [other, setOther] = useState<boolean[]>(() => questions.map(() => false));
  const instant = questions.length === 1 && !questions[0].multi;
  const done = questions.filter((_, i) => answered(answers[i])).length;

  if (!questions.length) return null;

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

  const chip = (selected: boolean) =>
    `rounded-md border px-3 py-1 text-left text-xs transition-colors disabled:opacity-50 ${selected
      ? "border-primary bg-primary/15 text-primary"
      : "border-border-solid bg-surface text-body hover:border-primary hover:text-primary"}`;

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border-solid bg-surface-2/60 p-2">
      {questions.map((q, i) => {
        const a = answers[i] || EMPTY;
        const writing = other[i];
        return (
          <fieldset key={i} disabled={!answerable} className="min-w-0">
            <legend className="mb-1.5 text-sm text-heading">
              {questions.length > 1 && <span className="mr-1.5 text-[11px] text-muted">{i + 1}/{questions.length}{q.header ? ` · ${q.header}` : ""}</span>}
              {q.question}
              {q.multi && <span className="ml-1 text-[11px] text-muted">（可多选）</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map(o => (
                <button key={o.label} type="button" aria-pressed={a.choices.includes(o.label)} onClick={() => pick(i, q, o.label)}
                  className={chip(a.choices.includes(o.label))}>
                  <span>{o.label}</span>
                  {o.description && <span className="block text-[11px] text-muted">{o.description}</span>}
                </button>
              ))}
              <button type="button" aria-pressed={a.choices.includes(ASK_DECIDE)} title="用默认值，或由主创判断"
                onClick={() => pick(i, q, ASK_DECIDE)} className={chip(a.choices.includes(ASK_DECIDE))}>{ASK_DECIDE}</button>
              <button type="button" aria-pressed={writing}
                onClick={() => setOther(list => list.map((o, j) => (j === i ? !o : o)))}
                className={chip(writing || Boolean(a.text?.trim()))}>其他…</button>
            </div>
            {writing && (
              <div className="mt-2 flex gap-2">
                <input autoFocus aria-label={`${q.header || q.question}：自己写`} value={a.text || ""}
                  onChange={e => write(i, q, e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && instant) { e.preventDefault(); send([answers[i]]); } }}
                  placeholder="写下你的想法"
                  className="min-w-0 flex-1 rounded-md border border-border-solid bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary/60" />
                {instant && <button type="button" disabled={!a.text?.trim()} onClick={() => send([a])}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">发送</button>}
              </div>
            )}
          </fieldset>
        );
      })}
      {!instant && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-muted">已答 {done}/{questions.length}</span>
          <button type="button" disabled={!answerable || done < questions.length} onClick={() => send(answers)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">提交</button>
        </div>
      )}
    </div>
  );
}
