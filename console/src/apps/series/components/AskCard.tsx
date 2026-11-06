import { useEffect, useState } from "react";
import { Check, CornerDownLeft, PenLine, RefreshCw } from "lucide-react";
import { ASK_PENDING, ASK_REFRESH, askQuestions } from "../api";
import type { Ask, AskAnswer, AskQuestion } from "../api";
import { isTyping } from "./bits";

const EMPTY: AskAnswer = { choices: [] };

function answered(a: AskAnswer | undefined): boolean {
  return Boolean(a && (a.action === "refresh" || a.choices.length || a.text?.trim()));
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
 * `mcp__ui__ask` 的问题卡片。每题是选项 +「换一批」+「自己写」。
 * 所有选择（包括换批）都先暂存，点「确认」后统一提交。
 * 正在等回答的卡片可以用数字键 1–9 选、Enter 确认；答过的卡片显示当时选了什么。
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
  const done = questions.filter((_, i) => answered(answers[i])).length;
  const refreshing = answers.some(a => a.action === "refresh");
  const chosen = answer !== undefined ? parseAnswer(questions, answer) : null;
  const active = answerable && !chosen;
  const canSend = active && questions.length > 0 && (refreshing || done === questions.length);

  const update = (i: number, next: AskAnswer) => setAnswers(list => list.map((a, j) => (j === i ? next : a)));
  const send = () => {
    if (canSend) onAnswer(ask, answers);
  };
  const refresh = (i: number) => {
    if (!active || !questions.length) return;
    update(i, answers[i]?.action === "refresh" ? EMPTY : { choices: [], action: "refresh" });
    setOther(list => list.map((o, j) => (j === i ? false : o)));
  };

  const pick = (i: number, q: AskQuestion, label: string) => {
    const current = answers[i] || EMPTY;
    let choices: string[];
    if (!q.multi) {
      choices = current.choices.length === 1 && current.choices[0] === label ? [] : [label];
    } else {
      choices = current.choices.includes(label) ? current.choices.filter(c => c !== label) : [...current.choices, label];
    }
    // 单选时，点选项就放弃「其他」里写的话；多选可以两者都要。
    const next = { choices, text: q.multi ? current.text : undefined };
    if (!q.multi) setOther(list => list.map((o, j) => (j === i ? false : o)));
    update(i, next);
  };

  const write = (i: number, q: AskQuestion, text: string) => {
    const current = answers[i] || EMPTY;
    update(i, { choices: q.multi ? current.choices : [], text });
  };

  const toggleOther = (i: number) => {
    if (answers[i]?.action === "refresh") update(i, EMPTY);
    setOther(list => list.map((o, j) => (j === i ? !o : o)));
  };

  // 1–9 picks in the first question still open; Enter confirms the collected answers and refresh requests.
  useEffect(() => {
    if (!active || !questions.length) return;
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" && canSend) { e.preventDefault(); send(); return; }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const i = questions.length === 1 ? 0 : Math.max(0, answers.findIndex(a => !answered(a)));
      const q = questions[i];
      const labels = [...q.options.map(o => o.label), ASK_REFRESH];
      if (n <= labels.length) { e.preventDefault(); if (labels[n - 1] === ASK_REFRESH) refresh(i); else pick(i, q, labels[n - 1]); }
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
                <span key={c} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-xs ${c === ASK_PENDING ? "border-border-solid text-muted" : "border-primary/40 bg-primary/10 text-heading"}`}>
                  {c === ASK_REFRESH ? <RefreshCw size={11} aria-hidden className="text-primary" /> : c !== ASK_PENDING && <Check size={11} aria-hidden className="text-primary" />}{c}
                </span>
              )) : <span className="text-xs text-dim">—</span>}
            </span>
          </div>
        ))}
        <p className="flex items-center gap-1 pt-0.5 text-[11px] text-dim">{chosen.some(parts => parts.includes(ASK_REFRESH)) ? <><RefreshCw size={12} aria-hidden className="text-primary" />已请求更换选项</> : <><Check size={12} aria-hidden className="text-spark-mint" />已回答</>}</p>
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
              <div className={block ? "flex flex-wrap gap-1.5 pt-0.5" : "contents"}>
                <button type="button" aria-pressed={a.action === "refresh"} title="选中后点「确认」更换这一题的候选，保留其他题已选的答案"
                  onClick={() => refresh(i)} className={chip(a.action === "refresh", false)}>
                  {badge(q.options.length + 1, a.action === "refresh")}<RefreshCw size={13} aria-hidden className="mt-0.5" />{ASK_REFRESH}
                </button>
                <button type="button" aria-pressed={writing}
                  onClick={() => toggleOther(i)}
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
                      send();
                    }
                  }}
                  placeholder="写下你的想法，Enter 确认"
                  className="min-w-0 flex-1 rounded-md border border-border-solid bg-surface px-2.5 py-1.5 text-sm text-body outline-none focus:border-primary/60" />
              </div>
            )}
          </fieldset>
        );
      })}
      <div className="space-y-2">
        {active && refreshing && <p className="text-[11px] text-muted">点「确认」后统一更换，其他题已选的答案会保留</p>}
        <div className="flex items-center justify-end gap-3">
          <span className="text-[11px] tabular-nums text-muted">已选 {done}/{questions.length}</span>
          <button type="button" disabled={!canSend} onClick={send}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:bg-accent disabled:opacity-40">
            确认<CornerDownLeft size={12} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
