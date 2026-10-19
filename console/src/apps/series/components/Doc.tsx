/**
 * 把项目里的 md 排版好再给人看：正文去掉系统注释后按文章排版，frontmatter 变成字段卡片，
 * 偏好 / 决定流水 / 伏笔台账这几份固定格式的文件各有自己的结构化样子。
 * 总览和文件视图共用这里的组件。
 */

import { memo, useState, type ReactNode } from "react";
import { Bot, ChevronDown, MessageSquarePlus, User } from "lucide-react";
import { Markdown } from "../../../components/ui/Markdown";
import type { ProjectStatus } from "../api";
import {
  FIELD_LABEL, MANAGED_FIELDS, PREFERENCE_SECTIONS, bullets, logActor, parseFields, parseLog, parseSections, parseTable,
  sectionBody, stripComments, type Field, type LogEntry, type Table,
} from "../notes";
import { authorLabel, refLabel, shortVersion, timeLabel } from "../stages";
import { StatusPill, toneOf } from "./bits";

/** Markdown as an article, without the `<!-- … -->` the system leaves for itself. */
export const MdBody = memo(function MdBody({ text, compact = false }: { text: string; compact?: boolean }) {
  return <Markdown text={stripComments(text).trim()} variant={compact ? "compact" : "article"} />;
});

/** A ref the agent writes (`story/ep-001/script-ep-001.v002.md@v2`) inside free text. */
const REF_IN_TEXT = /([\w./-]+\.v\d{3,}\.[a-z0-9]+(?:@v\d+)?|[\w./-]+@v\d+)/gi;

/** Free text with every ref in it as a chip that opens it. */
export function RefText({ text, status, onOpen }: { text: string; status: ProjectStatus | null; onOpen?: (ref: string) => void }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_IN_TEXT)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const ref = m[0];
    parts.push(onOpen
      ? <button key={at} type="button" onClick={() => onOpen(ref)} title={ref}
          className="mx-0.5 inline rounded border border-border-solid bg-surface-2/70 px-1 text-[0.92em] text-heading transition-colors hover:border-primary hover:text-primary">{refLabel(status, ref)}</button>
      : <span key={at} title={ref} className="mx-0.5 rounded bg-surface-2/70 px-1 text-heading">{refLabel(status, ref)}</span>);
    last = at + ref.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ------------------------------------------------------------ frontmatter

function FieldValue({ field, status, onOpen }: { field: Field; status: ProjectStatus | null; onOpen?: (ref: string) => void }) {
  const { key, value } = field;
  if (key === "status" && typeof value === "string") return <StatusPill tone={toneOf(value)} />;
  if (key === "created_by" && typeof value === "string") return <>{authorLabel(value)}</>;
  if (key === "created_at" && typeof value === "string") return <span title={value}>{timeLabel(value) || value}</span>;
  if (key === "version" && typeof value === "string") return <span className="tabular-nums">{/^\d+$/.test(value) ? `v${Number(value)}` : value}</span>;
  if ((key === "depends_on" || key === "revision_of") && value) {
    const refs = Array.isArray(value) ? value : [value];
    return (
      <span className="flex flex-wrap gap-1">
        {refs.map(ref => onOpen
          ? <button key={ref} type="button" onClick={() => onOpen(ref)} title={ref}
              className="rounded border border-border-solid bg-surface px-1.5 text-[11px] text-body transition-colors hover:border-primary hover:text-primary">{refLabel(status, ref)}</button>
          : <span key={ref} title={ref} className="rounded border border-border-solid px-1.5 text-[11px]">{refLabel(status, ref)}</span>)}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-dim">—</span>;
    return <span className="flex flex-wrap gap-1">{value.map((v, i) => <span key={i} className="rounded bg-surface-2 px-1.5 text-[11px] text-body">{v}</span>)}</span>;
  }
  if (!value) return <span className="text-dim">—</span>;
  if (/^tbd$/i.test(value)) return <span className="rounded bg-spark-flare/10 px-1.5 text-[11px] text-spark-flare" title="还没定">待定</span>;
  return <span className="whitespace-pre-wrap break-words">{value}</span>;
}

/**
 * A version's frontmatter as a card: the author's fields up front, what the system keeps
 * (kind / version / status / depends_on…) in a quiet line below.
 */
export function FieldsCard({ yaml, status, onOpen, className = "" }: {
  yaml: string;
  status: ProjectStatus | null;
  onOpen?: (ref: string) => void;
  className?: string;
}) {
  const [showSystem, setShowSystem] = useState(false);
  const fields = parseFields(yaml);
  if (!fields.length) return null;
  const own = fields.filter(f => !MANAGED_FIELDS.includes(f.key));
  const system = fields.filter(f => MANAGED_FIELDS.includes(f.key) && f.key !== "session");
  const row = (f: Field) => (
    <div key={f.key} className="grid grid-cols-[minmax(4.5rem,8rem)_minmax(0,1fr)] gap-3 px-3 py-1.5">
      <dt className="truncate text-muted" title={f.key}>{FIELD_LABEL[f.key] || f.key}</dt>
      <dd className="min-w-0 text-body"><FieldValue field={f} status={status} onOpen={onOpen} /></dd>
    </div>
  );
  return (
    <div className={`overflow-hidden rounded-lg border border-border-solid bg-surface/60 text-xs ${className}`}>
      {own.length > 0 && <dl className="divide-y divide-border-solid/60">{own.map(row)}</dl>}
      {system.length > 0 && (
        <>
          <button type="button" onClick={() => setShowSystem(s => !s)} aria-expanded={showSystem}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-dim transition-colors hover:text-heading ${own.length ? "border-t border-border-solid" : ""}`}>
            <ChevronDown size={12} aria-hidden className={`shrink-0 transition-transform ${showSystem ? "" : "-rotate-90"}`} />
            <span className="shrink-0">系统信息</span>
            {!showSystem && (
              <span className="min-w-0 truncate">
                {system.filter(f => ["kind", "version", "status", "created_by"].includes(f.key))
                  .map(f => (f.key === "version" && typeof f.value === "string" ? `v${Number(f.value) || f.value}`
                    : f.key === "created_by" && typeof f.value === "string" ? authorLabel(f.value)
                    : f.key === "status" && typeof f.value === "string" ? ({ canonical: "定稿", draft: "草稿", stale: "过期", deprecated: "弃用" } as Record<string, string>)[f.value] || f.value
                    : String(f.value))).join(" · ")}
              </span>
            )}
          </button>
          {showSystem && <dl className="divide-y divide-border-solid/60 border-t border-border-solid/60 bg-surface-2/30">{system.map(row)}</dl>}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the project notes

/** preferences.md as four cards; an empty one says what goes there and offers to tell the agent. */
export function PreferenceCards({ text, onAsk, columns = 2 }: { text: string; onAsk?: (prompt: string) => void; columns?: 1 | 2 }) {
  const doc = parseSections(text);
  const known = new Set(PREFERENCE_SECTIONS.map(s => s.name));
  const extra = doc.sections.filter(s => !known.has(s.heading) && bullets(s.body).length);
  return (
    <div className={`grid gap-2.5 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {PREFERENCE_SECTIONS.map(({ name, hint, ask }) => {
        const items = bullets(sectionBody(doc, name));
        return (
          <section key={name} className="group/pref flex flex-col rounded-lg border border-border-solid bg-surface/60 p-3">
            <div className="flex items-baseline gap-2">
              <h4 className="text-sm font-medium text-heading">{name}</h4>
              {items.length > 0 && <span className="text-[11px] tabular-nums text-dim">{items.length}</span>}
              {onAsk && (
                <button type="button" onClick={() => onAsk(ask)} title="在对话里补充"
                  className="ms-auto rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover/pref:opacity-100">
                  <MessageSquarePlus size={13} aria-hidden />
                </button>
              )}
            </div>
            {items.length ? (
              <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-body">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2"><span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-primary/60" /><span className="min-w-0"><Markdown text={item} /></span></li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 flex flex-1 flex-col items-start gap-1.5">
                <p className="text-xs text-dim">{hint}</p>
                {onAsk && (
                  <button type="button" onClick={() => onAsk(ask)}
                    className="text-[11px] text-primary/80 transition-colors hover:text-primary">告诉主创 →</button>
                )}
              </div>
            )}
          </section>
        );
      })}
      {extra.map(s => (
        <section key={s.heading} className="rounded-lg border border-border-solid bg-surface/60 p-3">
          <h4 className="text-sm font-medium text-heading">{s.heading}</h4>
          <div className="mt-1.5 text-[13px] text-body"><MdBody text={s.body} compact /></div>
        </section>
      ))}
    </div>
  );
}

/** log.md as a timeline, newest first. */
export function LogTimeline({ entries, status, onOpen, limit }: {
  entries: LogEntry[];
  status: ProjectStatus | null;
  onOpen?: (ref: string) => void;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const newest = [...entries].reverse();
  const shown = limit && !all ? newest.slice(0, limit) : newest;
  if (!entries.length) return <p className="text-xs text-dim">还没有记录。定稿、改动、重要的决定都会记在这里。</p>;
  return (
    <div>
      <ol className="relative space-y-2.5 before:absolute before:inset-y-1 before:start-[7px] before:w-px before:bg-border-solid">
        {shown.map((e, i) => {
          const user = logActor(e) === "user";
          const Icon = user ? User : Bot;
          return (
            <li key={`${e.at}-${i}`} className="relative flex gap-2.5 ps-0">
              <span aria-hidden className={`relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full ring-2 ring-bg ${user ? "bg-spark-blue/20 text-spark-blue" : "bg-surface-3 text-muted"}`}>
                <Icon size={9} />
              </span>
              <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-body">
                <RefText text={e.text} status={status} onOpen={onOpen} />
                <div className="text-[11px] text-dim">{[user ? "你" : "主创", timeLabel(e.at)].filter(Boolean).join(" · ")}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {limit && entries.length > limit && (
        <button type="button" onClick={() => setAll(a => !a)} className="mt-2 ps-6 text-[11px] text-muted hover:text-primary">
          {all ? "收起" : `全部 ${entries.length} 条`}
        </button>
      )}
    </div>
  );
}

// Open first: 「未回收」 is still open.
const THREAD_STATE: [RegExp, string][] = [
  [/(未|待|open|埋|进行)/i, "border-spark-blue/40 bg-spark-blue/10 text-spark-blue"],
  [/(放弃|作废|dropped)/i, "border-border-solid text-dim line-through"],
  [/(已收|回收|closed|done|✓|✔)/i, "border-spark-mint/40 bg-spark-mint/10 text-spark-mint"],
];

/** story/threads.md: the ledger table, with the state column as tags. */
export function ThreadsTable({ text, status, onOpen }: { text: string; status: ProjectStatus | null; onOpen?: (ref: string) => void }) {
  const doc = parseSections(text);
  const table: Table | null = parseTable(sectionBody(doc, "台账")) || doc.sections.map(s => parseTable(s.body)).find(Boolean) || null;
  const rest = doc.sections.filter(s => s.heading !== "台账" && !parseTable(s.body) && s.body.trim());
  if (!table?.rows.length && !rest.length) return <p className="text-xs text-dim">还没有伏笔。埋下的悬念、计划在哪一集收，都会记在这里。</p>;
  const stateCol = table ? table.header.findIndex(h => /状态|state/i.test(h)) : -1;
  return (
    <div className="space-y-3">
      {table && table.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-solid">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-surface-2/70 text-muted">
              <tr>{table.header.map(h => <th key={h} className="whitespace-nowrap px-2.5 py-1.5 text-start font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border-solid/60">
              {table.rows.map((row, r) => (
                <tr key={r} className="align-top transition-colors hover:bg-surface-2/40">
                  {row.map((cell, c) => (
                    <td key={c} className={`px-2.5 py-1.5 ${c === 0 ? "whitespace-nowrap font-mono text-[11px] text-dim" : "text-body"}`}>
                      {c === stateCol && cell
                        ? <span className={`inline-flex whitespace-nowrap rounded-full border px-1.5 text-[11px] ${THREAD_STATE.find(([re]) => re.test(cell))?.[1] || "border-border-solid text-muted"}`}>{cell}</span>
                        : <RefText text={cell} status={status} onOpen={onOpen} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rest.map(s => (
        <section key={s.heading}>
          <h4 className="mb-1 text-xs font-medium text-muted">{s.heading}</h4>
          <div className="text-body"><MdBody text={s.body} /></div>
        </section>
      ))}
    </div>
  );
}

/** One of the project notes, laid out by what it is (files view preview). */
export function NotePreview({ id, text, status, onOpen }: {
  id: "project" | "preferences" | "log" | "threads";
  text: string;
  status: ProjectStatus | null;
  onOpen?: (ref: string) => void;
}) {
  const doc = parseSections(text);
  const title = doc.title || { project: "项目总览", preferences: "偏好", log: "决定流水", threads: "伏笔与悬念台账" }[id];
  return (
    <article className="mx-auto max-w-3xl px-6 py-5">
      <h1 className="mb-4 font-display text-xl text-heading">{title}</h1>
      {id === "preferences" ? <PreferenceCards text={text} />
        : id === "log" ? <LogTimeline entries={parseLog(text)} status={status} onOpen={onOpen} />
        : id === "threads" ? <ThreadsTable text={text} status={status} onOpen={onOpen} />
        : <ProjectSections text={text} status={status} onOpen={onOpen} />}
    </article>
  );
}

/** PROJECT.md section by section; the generated ones are marked, refs open. */
function ProjectSections({ text, status, onOpen }: { text: string; status: ProjectStatus | null; onOpen?: (ref: string) => void }) {
  const doc = parseSections(text);
  const auto = new Set(["Canonical", "Stale"]);
  const names: Record<string, string> = { Snapshot: "现状", Canonical: "已定稿", Defaults: "默认约定", "In progress": "进行中", Stale: "过期", "Topic files": "专题文件" };
  return (
    <div className="space-y-4">
      {doc.intro && <div className="text-body"><MdBody text={doc.intro} /></div>}
      {doc.sections.map(s => {
        const items = bullets(s.body);
        return (
          <section key={s.heading} className="rounded-lg border border-border-solid bg-surface/50 p-3">
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-medium text-heading">
              {names[s.heading] || s.heading}
              {names[s.heading] && <span className="font-mono text-[10px] font-normal text-dim">{s.heading}</span>}
              {auto.has(s.heading) && <span className="ms-auto rounded bg-surface-2 px-1.5 text-[10px] font-normal text-dim" title="系统按版本状态生成">自动</span>}
            </h2>
            {!items.length ? <p className="text-xs text-dim">（空）</p>
              : /^[-*+]\s/m.test(s.body) ? (
                <ul className="space-y-1 text-[13px] leading-relaxed text-body">
                  {items.map((item, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-primary/60" /><span className="min-w-0"><RefText text={item} status={status} onOpen={onOpen} /></span></li>)}
                </ul>
              ) : <div className="text-body"><MdBody text={s.body} /></div>}
          </section>
        );
      })}
    </div>
  );
}

export { shortVersion };
