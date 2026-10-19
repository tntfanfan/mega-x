/**
 * 总览：一个项目的全貌，打开项目先看到这里。
 * - 现状（PROJECT.md 的 Snapshot）和 bible 里的关键设定；
 * - 各环节的定稿进度，点进去就是那一栏；
 * - 待你处理：过期的、有新稿的、还没定稿的，就地选版本或交给主创；
 * - 定稿一览：每一项最终用的是哪一版，就地换；
 * - 你的偏好、项目约定、伏笔台账、最近的决定（preferences.md / PROJECT.md / threads.md / log.md）。
 * 数据：进度和版本来自 status（账本算出来的），其余读项目里的那几份 md。
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BookMarked, CheckCircle2, ChevronDown, FileText, Flag, History, ListChecks, MessageSquarePlus,
  PenLine, Settings2, Sparkles, Video,
} from "lucide-react";
import type { ChatRef, ProjectStatus, SeriesApi, StatusItem } from "../api";
import { dragRef } from "../drag";
import {
  NOTE_FILES, bullets, isBlank, parseFields, parseLog, parseSections, sectionBody, splitFrontmatter, type Field, type NoteId,
} from "../notes";
import { STAGES, hasNewer, itemRef, itemState, sectionOf, shortLabel, shortVersion, stageItems, type StageId } from "../stages";
import { KindIcon, StatusPill } from "./bits";
import { LogTimeline, MdBody, PreferenceCards, RefText, ThreadsTable } from "./Doc";
import { FinalPicker, canFinal, type Notice } from "./FinalPicker";

type Props = {
  api: SeriesApi;
  status: ProjectStatus;
  refreshKey: number;
  width: number;
  onStage: (stage: StageId) => void;
  onShow: (item: StatusItem) => void;
  onOpen: (ref: string) => void;
  onOpenFile: (path: string) => void;
  onSuggest: (text: string) => void;
  onAsk: (text: string, ref?: ChatRef) => void;
  onRef: (ref: ChatRef) => void;
  onChanged: () => void;
  onNotice: (notice: Notice) => void;
  onUpdateDownstream: (label: string, ref: string) => void;
};

type Notes = Record<NoteId, string>;
const NO_NOTES: Notes = { project: "", preferences: "", log: "", threads: "" };

/** The project notes, re-read whenever something in the project changes; a missing file is empty. */
function useNotes(api: SeriesApi, pid: string, refreshKey: number): Notes | null {
  const [notes, setNotes] = useState<{ pid: string; notes: Notes } | null>(null);
  useEffect(() => {
    let alive = true;
    const ids = Object.keys(NOTE_FILES) as NoteId[];
    Promise.all(ids.map(id => api.file(pid, NOTE_FILES[id]).then(f => f.text || "", () => "")))
      .then(texts => { if (alive) setNotes({ pid, notes: Object.fromEntries(ids.map((id, i) => [id, texts[i]])) as Notes }); });
    return () => { alive = false; };
  }, [api, pid, refreshKey]);
  return notes?.pid === pid ? notes.notes : null;
}

/** The bible's frontmatter (the version in use): logline, episodes, aspect, art style. */
function useBible(api: SeriesApi, pid: string, bible: StatusItem | undefined): Field[] {
  const [fields, setFields] = useState<Field[]>([]);
  const ref = bible ? itemRef(bible) : "";
  useEffect(() => {
    if (!bible) { setFields([]); return; }
    let alive = true;
    api.artifact(pid, bible.logical).then(d => {
      const v = d.versions.find(x => x.ref === ref) || d.versions[d.versions.length - 1];
      if (alive) setFields(v?.text ? parseFields(splitFrontmatter(v.text)[0]) : []);
    }).catch(() => { if (alive) setFields([]); });
    return () => { alive = false; };
  }, [api, pid, bible?.logical, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  return fields;
}

const PROJECT_SECTIONS = new Set(["Snapshot", "Canonical", "Defaults", "In progress", "Stale", "Topic files"]);

export function Overview(props: Props) {
  const { api, status, refreshKey, width, onShow, onSuggest } = props;
  const pid = status.project_id;
  const notes = useNotes(api, pid, refreshKey);
  const items = status.items;
  const bible = items.find(i => i.kind === "bible" && itemState(i) !== "deprecated");
  const bibleFields = useBible(api, pid, bible);
  const two = width >= 860;

  // PROJECT.md without what the system writes for itself (Canonical / Stale / the auto block of In progress).
  const project = useMemo(() => parseSections((notes?.project || "").replace(/<!--\s*auto:begin\s*-->[\s\S]*?<!--\s*auto:end\s*-->/g, "")), [notes?.project]);
  const snapshot = sectionBody(project, "Snapshot");
  const defaults = bullets(sectionBody(project, "Defaults"));
  const doing = bullets(sectionBody(project, "In progress"));
  const topics = bullets(sectionBody(project, "Topic files"));
  const others = project.sections.filter(s => !PROJECT_SECTIONS.has(s.heading) && !isBlank(s.body));
  const log = useMemo(() => parseLog(notes?.log || ""), [notes?.log]);

  const finalable = items.filter(i => canFinal(i) && itemState(i) !== "deprecated");
  const stale = finalable.filter(i => itemState(i) === "stale");
  const newer = finalable.filter(hasNewer);
  const undecided = finalable.filter(i => itemState(i) === "draft");
  const done = finalable.filter(i => itemState(i) === "canonical").length;

  const picker = (item: StatusItem, size: "sm" | "md" = "sm") => (
    <FinalPicker api={api} projectId={pid} item={item} size={size} onChanged={props.onChanged} onNotice={props.onNotice}
      onUpdateDownstream={props.onUpdateDownstream} />
  );
  const chatRef = (item: StatusItem): ChatRef => ({ ref: itemRef(item), label: item.label, project_id: pid });

  const hero = (
    <header className="rounded-xl border border-border-solid bg-gradient-to-br from-surface to-surface-2/40 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl text-heading">{status.title || pid}</h2>
        {bible && (
          <button type="button" onClick={() => onShow(bible)} className="text-[11px] text-muted transition-colors hover:text-primary">
            Bible {shortVersion(itemRef(bible))} →
          </button>
        )}
      </div>
      <BibleFacts fields={bibleFields} />
      <div className="mt-3">
        {!notes ? <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
          : isBlank(snapshot) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
              还没写现状：一两句话说这部剧现在到哪了。
              <button type="button" onClick={() => onSuggest("用一两句话把这部剧现在到哪了写进 PROJECT.md 的现状（Snapshot）。")}
                className="inline-flex items-center gap-1 text-primary/80 hover:text-primary"><Sparkles size={11} aria-hidden />让主创写</button>
            </div>
          ) : <div className="text-[13px] leading-relaxed text-body"><MdBody text={snapshot} /></div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span><b className="font-medium tabular-nums text-heading">{done}</b> / {finalable.length} 项已定稿</span>
        {stale.length > 0 && <span className="text-spark-flare"><b className="font-medium tabular-nums">{stale.length}</b> 项过期</span>}
        {newer.length > 0 && <span className="text-spark-blue"><b className="font-medium tabular-nums">{newer.length}</b> 项有新稿</span>}
        {undecided.length > 0 && <span><b className="font-medium tabular-nums text-body">{undecided.length}</b> 项还没定稿</span>}
      </div>
    </header>
  );

  const stages = (
    <Block title="进度" icon={<ListChecks size={14} />}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {STAGES.map(s => <StageTile key={s.id} stage={s.id} items={stageItems(status, s.id)} onClick={() => props.onStage(s.id)} />)}
      </div>
    </Block>
  );

  const todo = stale.length + newer.length + undecided.length;
  const attention = (
    <Block title="待你处理" icon={<Flag size={14} />} count={todo || undefined}>
      {!todo ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border-solid px-3 py-3 text-xs text-muted">
          <CheckCircle2 size={14} aria-hidden className="text-spark-mint" />
          {finalable.length ? "每一项都选好了最终使用的版本，没有过期的。" : "还没有产出物。在左边跟主创说想先做什么。"}
        </p>
      ) : (
        <ul className="divide-y divide-border-solid/60 overflow-visible rounded-lg border border-border-solid bg-surface/60">
          {stale.map(item => (
            <Todo key={item.logical} item={item} tone="stale" onShow={() => onShow(item)} chatRef={chatRef(item)} picker={picker(item)}
              text={`上游改了，${shortVersion(itemRef(item))} 需要按新的上游更新`}
              action={{ label: "让主创更新", run: () => props.onAsk(`「${item.label}」的上游改了，按新的上游把它更新一版。`, chatRef(item)) }} />
          ))}
          {newer.map(item => (
            <Todo key={item.logical} item={item} tone="newer" onShow={() => onShow(item)} chatRef={chatRef(item)} picker={picker(item)}
              text={`有新稿 ${shortVersion(item.latest)}，现在用的是 ${shortVersion(item.canonical!)}`}
              action={{ label: "对比一下", run: () => props.onOpen(item.latest) }} />
          ))}
          <Collapsible items={undecided} limit={stale.length + newer.length ? 3 : 6} more={n => `还有 ${n} 项没定稿`}>
            {item => (
              <Todo key={item.logical} item={item} tone="draft" onShow={() => onShow(item)} chatRef={chatRef(item)} picker={picker(item)}
                text={`还没定稿 · 最新 ${shortVersion(item.latest)}`} />
            )}
          </Collapsible>
        </ul>
      )}
    </Block>
  );

  const finals = (
    <Block title="定稿一览" icon={<CheckCircle2 size={14} />} hint="每一项最终使用哪一版，点版本号就能换">
      {!finalable.length ? <p className="text-xs text-dim">还没有产出物。</p> : (
        <div className="space-y-3">
          {STAGES.map(s => {
            const list = stageItems(status, s.id).filter(i => canFinal(i) && itemState(i) !== "deprecated");
            if (!list.length) return null;
            const live = list.filter(i => itemState(i) === "canonical").length;
            return (
              <section key={s.id}>
                <button type="button" onClick={() => props.onStage(s.id)}
                  className="group/h mb-1 flex w-full items-center gap-2 text-left text-xs text-muted transition-colors hover:text-heading">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-dim">{live}/{list.length}</span>
                  <ArrowRight size={11} aria-hidden className="opacity-0 transition-opacity group-hover/h:opacity-100" />
                </button>
                <ul className="divide-y divide-border-solid/50 rounded-lg border border-border-solid bg-surface/60">
                  <Collapsible items={list} limit={8} more={n => `还有 ${n} 项`}>
                    {item => <FinalRow key={item.logical} item={item} src={api.mediaSrc} onShow={() => onShow(item)} chatRef={chatRef(item)} picker={picker(item)} />}
                  </Collapsible>
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Block>
  );

  const openFile = (id: NoteId) => (
    <button type="button" onClick={() => props.onOpenFile(NOTE_FILES[id])} title={`打开 ${NOTE_FILES[id]}`}
      className="inline-flex items-center gap-1 text-[11px] text-dim transition-colors hover:text-primary">
      <FileText size={11} aria-hidden />{NOTE_FILES[id].split("/").pop()}
    </button>
  );

  const preferences = (
    <Block title="你的偏好" icon={<Settings2 size={14} />} hint="主创每次干活前都会读" action={openFile("preferences")}>
      {notes ? <PreferenceCards text={notes.preferences} onAsk={onSuggest} columns={two ? 1 : 2} /> : <Skeleton />}
    </Block>
  );

  const conventions = (
    <Block title="项目约定" icon={<BookMarked size={14} />} action={openFile("project")}>
      {!notes ? <Skeleton /> : (
        <div className="space-y-3">
          <NoteList title="默认约定" items={defaults} status={status} onOpen={props.onOpen}
            empty="还没有。比如统一的画幅、配音风格、每集结尾怎么收。" ask={() => onSuggest("记一个这部剧的默认约定：")} />
          {doing.length > 0 && <NoteList title="手头在做" items={doing} status={status} onOpen={props.onOpen} />}
          {others.map(s => (
            <div key={s.heading}>
              <h4 className="mb-1 text-xs font-medium text-muted">{s.heading}</h4>
              <div className="text-[13px] text-body"><MdBody text={s.body} compact /></div>
            </div>
          ))}
          {topics.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted">专题文件</h4>
              <ul className="space-y-1">
                {topics.map(t => {
                  const [path, ...rest] = t.split(/\s+[—–-]{1,2}\s+/);
                  const file = path.replace(/^`|`$/g, "").trim();
                  return (
                    <li key={t} className="flex min-w-0 items-baseline gap-2 text-xs">
                      <button type="button" onClick={() => props.onOpenFile(file)}
                        className="shrink-0 font-mono text-[11px] text-heading transition-colors hover:text-primary">{file}</button>
                      {rest.length > 0 && <span className="min-w-0 truncate text-dim">{rest.join(" — ")}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Block>
  );

  const threads = notes && (notes.threads.trim() || items.some(i => i.kind === "script")) ? (
    <Block title="伏笔台账" icon={<PenLine size={14} />} action={openFile("threads")}>
      <ThreadsTable text={notes.threads} status={status} onOpen={props.onOpen} />
    </Block>
  ) : null;

  const decisions = (
    <Block title="最近的决定" icon={<History size={14} />} action={openFile("log")}>
      {notes ? <LogTimeline entries={log} status={status} onOpen={props.onOpen} limit={8} /> : <Skeleton />}
    </Block>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto max-w-6xl px-4 py-4 ${two ? "grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-start gap-5" : "space-y-5"}`}>
        {two ? (
          <>
            <div className="min-w-0 space-y-5">{hero}{stages}{attention}{finals}{threads}</div>
            <div className="min-w-0 space-y-5">{preferences}{conventions}{decisions}</div>
          </>
        ) : (
          <>{hero}{stages}{attention}{finals}{preferences}{conventions}{threads}{decisions}</>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ pieces

function Block({ title, icon, count, hint, action, children }: {
  title: string;
  icon: ReactNode;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="text-primary">{icon}</span>
        <h3 className="text-sm font-medium text-heading">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-spark-flare/15 px-1.5 text-[11px] tabular-nums text-spark-flare">{count}</span>}
        {hint && <span className="hidden truncate text-[11px] text-dim sm:inline">{hint}</span>}
        {action && <span className="ms-auto shrink-0">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Skeleton() {
  return <div className="space-y-2"><div className="h-14 animate-pulse rounded-lg bg-surface-2/60" /><div className="h-14 animate-pulse rounded-lg bg-surface-2/40" /></div>;
}

/** The first `limit` children, then a row that shows the rest. */
function Collapsible<T>({ items, limit, more, children }: { items: T[]; limit: number; more: (n: number) => string; children: (item: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      {shown.map(children)}
      {items.length > limit && (
        <li>
          <button type="button" onClick={() => setAll(a => !a)} aria-expanded={all}
            className="flex w-full items-center justify-center gap-1 px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-primary">
            {all ? "收起" : more(items.length - limit)}
            <ChevronDown size={11} aria-hidden className={`transition-transform ${all ? "rotate-180" : ""}`} />
          </button>
        </li>
      )}
    </>
  );
}

const FACT_KEYS = ["genre", "aspect", "art_style", "tone", "audience"];

function BibleFacts({ fields }: { fields: Field[] }) {
  const get = (key: string) => {
    const v = fields.find(f => f.key === key)?.value;
    const s = Array.isArray(v) ? v.join("、") : v || "";
    return /^tbd$/i.test(s) ? "" : s;
  };
  const logline = get("logline");
  const count = get("episode_count");
  const sec = get("episode_duration_sec");
  const facts = [
    count && `${count} 集`,
    sec && `每集 ${Number(sec) >= 60 && Number(sec) % 60 === 0 ? `${Number(sec) / 60} 分钟` : `${sec} 秒`}`,
    ...FACT_KEYS.map(get),
  ].filter(Boolean) as string[];
  if (!logline && !facts.length) return null;
  return (
    <div className="mt-1.5 space-y-2">
      {logline && <p className="text-[13px] text-muted">{logline}</p>}
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facts.map(f => <span key={f} className="rounded-full border border-border-solid bg-surface/70 px-2 py-0.5 text-[11px] text-body">{f}</span>)}
        </div>
      )}
    </div>
  );
}

function StageTile({ stage, items, onClick }: { stage: StageId; items: StatusItem[]; onClick: () => void }) {
  const s = STAGES.find(x => x.id === stage)!;
  const finals = items.filter(i => canFinal(i) && itemState(i) !== "deprecated");
  const live = finals.filter(i => itemState(i) === "canonical").length;
  const stale = finals.filter(i => itemState(i) === "stale").length;
  const newer = finals.filter(hasNewer).length;
  const pct = finals.length ? live / finals.length : 0;
  const plain = items.length > 0 && !finals.length; // reviews: nothing to finalise, just a count
  return (
    <button type="button" onClick={onClick} title={items.length ? `${s.label}：${live} 项定稿 / 共 ${finals.length} 项` : s.empty}
      className={`group flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${items.length ? "border-border-solid bg-surface" : "border-dashed border-border-solid/70 bg-transparent"}`}>
      <span className="flex items-center gap-1.5">
        <span className={`text-sm ${items.length ? "text-heading" : "text-dim"}`}>{s.label}</span>
        {stale > 0 && <span title={`${stale} 项过期`} className="h-1.5 w-1.5 rounded-full bg-spark-flare" />}
        {!stale && newer > 0 && <span title={`${newer} 项有新稿`} className="h-1.5 w-1.5 rounded-full bg-spark-blue" />}
        <ArrowRight size={11} aria-hidden className="ms-auto text-dim opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      {!items.length ? <span className="text-[11px] text-dim">还没有</span>
        : plain ? <span className="text-[11px] tabular-nums text-muted">{items.length} 条</span>
        : (
          <>
            <span className="text-[11px] tabular-nums text-muted"><b className="font-medium text-body">{live}</b>/{finals.length} 定稿</span>
            <span aria-hidden className="h-1 overflow-hidden rounded-full bg-surface-2">
              <span className={`block h-full rounded-full transition-[width] duration-500 ${stale ? "bg-spark-flare" : "bg-spark-mint"}`} style={{ width: `${Math.round(pct * 100)}%` }} />
            </span>
          </>
        )}
    </button>
  );
}

function Thumb({ item, src }: { item: StatusItem; src: (url: string) => string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
      {item.thumb ? <img src={src(item.thumb)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        : item.media_kind === "video" ? <Video size={15} aria-hidden className="text-dim" />
        : <KindIcon kind={item.kind} size={15} className="text-dim" />}
    </span>
  );
}

const TODO_TONE = { stale: AlertTriangle, newer: Sparkles, draft: PenLine } as const;

function Todo({ item, tone, text, onShow, chatRef, picker, action }: {
  item: StatusItem;
  tone: "stale" | "newer" | "draft";
  text: string;
  onShow: () => void;
  chatRef: ChatRef;
  picker: ReactNode;
  action?: { label: string; run: () => void };
}) {
  const Icon = TODO_TONE[tone];
  const color = tone === "stale" ? "text-spark-flare" : tone === "newer" ? "text-spark-blue" : "text-dim";
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2/40 focus-within:relative focus-within:z-10">
      <Icon size={14} aria-hidden className={`shrink-0 ${color}`} />
      <button type="button" onClick={onShow} draggable onDragStart={e => dragRef(e, chatRef)} title={`打开 ${item.label} · 拖到对话 = 引用`}
        className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] text-heading">{item.label}</span>
        <span className="block truncate text-[11px] text-muted">{text}</span>
      </button>
      {action && (
        <button type="button" onClick={action.run}
          className="hidden shrink-0 rounded-md border border-border-solid px-2 py-0.5 text-[11px] text-body transition-colors hover:border-primary hover:text-primary sm:inline-flex">
          {action.label}
        </button>
      )}
      <span className="shrink-0">{picker}</span>
    </li>
  );
}

function FinalRow({ item, src, onShow, chatRef, picker }: {
  item: StatusItem;
  src: (url: string) => string;
  onShow: () => void;
  chatRef: ChatRef;
  picker: ReactNode;
}) {
  const section = sectionOf(item);
  return (
    <li className="flex items-center gap-2.5 px-2.5 py-1.5 transition-colors hover:bg-surface-2/40 focus-within:relative focus-within:z-10">
      <Thumb item={item} src={src} />
      <button type="button" onClick={onShow} draggable onDragStart={e => dragRef(e, chatRef)} title={`打开 ${item.label} · 拖到对话 = 引用`}
        className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] text-heading">{shortLabel(item)}</span>
        {section && <span className="block truncate text-[11px] text-dim">{section}</span>}
      </button>
      {hasNewer(item) && <StatusPill tone="newer" title={`最新是 ${shortVersion(item.latest)}`}>新稿 {shortVersion(item.latest)}</StatusPill>}
      <span className="shrink-0">{picker}</span>
    </li>
  );
}

function NoteList({ title, items, status, onOpen, empty, ask }: {
  title: string;
  items: string[];
  status: ProjectStatus;
  onOpen: (ref: string) => void;
  empty?: string;
  ask?: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-xs font-medium text-muted">{title}</h4>
        {ask && (
          <button type="button" onClick={ask} title="在对话里补充" aria-label={`补充${title}`} className="text-dim transition-colors hover:text-primary">
            <MessageSquarePlus size={12} aria-hidden />
          </button>
        )}
      </div>
      {items.length ? (
        <ul className="space-y-1 text-[13px] leading-relaxed text-body">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
              <span className="min-w-0"><RefText text={t} status={status} onOpen={onOpen} /></span>
            </li>
          ))}
        </ul>
      ) : empty ? <p className="text-xs text-dim">{empty}</p> : null}
    </div>
  );
}
