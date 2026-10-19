import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, ChevronDown, ChevronRight, GitCompare, Images, LoaderCircle, MessageSquarePlus, Pencil, Quote, Undo2, X } from "lucide-react";
import { Markdown } from "../../../components/ui/Markdown";
import { apiErrorMessage } from "../../../lib/api";
import {
  ActionRefused, STATUS_LABEL, isImage,
  type Action, type ArtifactDetail, type ChatRef, type Impacts, type ProjectStatus, type SeriesApi, type Version,
} from "../api";
import { lineDiff, foldDiff } from "../diff";
import { dragRef, mediaPath } from "../drag";
import { authorLabel, refLabel, shortVersion, timeLabel } from "../stages";
import { KindIcon, StatusDot, StatusPill, isTyping, toneOf } from "./bits";
import { MediaGrid } from "./MediaGrid";
import { TextEditor } from "./TextEditor";

type Confirm = { action: Action; ref: string; impacts: Impacts; allowDraft: boolean };
type Refused = { action: Action; ref: string; message: string; problems: string[] };
type Notice = { text: string; error?: boolean; actions?: { label: string; run: () => void; primary?: boolean }[] };
type Mode = "read" | "edit" | "diff";

const ACTION_TEXT: Record<Action, string> = { canonical: "设为生效", uncanonical: "取消生效", deprecate: "弃用" };

/** 正文前的 YAML 头（kind / version / status…）是给系统看的，阅读器里不显示。 */
function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function bodyOf(v: Version): string {
  return v.body ?? (v.text ? stripFrontmatter(v.text) : "");
}

/** Re-rendering the Markdown remounts its DOM and drops the reader's text selection, so only redo it when the text changes. */
const ArticleBody = memo(function ArticleBody({ text }: { text: string }) {
  return <Markdown text={text} variant="article" />;
});

/** `revision_of` is a version path (no `@vN`). */
function sameVersion(ref: string, pathOrRef: string): boolean {
  return ref === pathOrRef || ref.startsWith(`${pathOrRef}@`);
}

/**
 * 一项产出物：版本条（旧 → 新，←/→ 切换）、生效 / 弃用、编辑文字、和改自的版本对比、
 * 读正文（选中一段可以「引用这段」）、看图选图；依赖 / 下游可以点过去。
 */
export function ArtifactView({ api, projectId, logical, focusRef, refreshKey, status, busy, connected, onSend, onRef, onQuote, onOpen, onChanged, onDirty }: {
  api: SeriesApi;
  projectId: string;
  logical: string;
  focusRef?: string;
  refreshKey: number;
  status: ProjectStatus | null;
  busy: boolean;
  connected: boolean;
  onSend: (text: string, refs: ChatRef[]) => boolean;
  onRef: (ref: ChatRef) => void;
  onQuote: (ref: ChatRef, text: string) => void;
  onOpen: (ref: string) => void;
  onChanged: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [mode, setMode] = useState<Mode>("read");
  const [base, setBase] = useState("");
  const [working, setWorking] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [refused, setRefused] = useState<Refused | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [quote, setQuote] = useState<{ x: number; y: number; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPicked(focusRef || ""); setMode("read"); setConfirm(null); setRefused(null); setNotice(null); setQuote(null); setBase("");
  }, [projectId, logical]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusRef) { setPicked(focusRef); setMode(m => (m === "edit" ? m : "read")); } }, [focusRef]);
  useEffect(() => {
    if (!projectId || !logical) { setDetail(null); return; }
    let alive = true;
    api.artifact(projectId, logical)
      .then(d => { if (alive) { setDetail(d); setError(""); } })
      .catch(e => { if (alive) setError(apiErrorMessage(e, "读取产出物失败")); });
    return () => { alive = false; };
  }, [api, projectId, logical, refreshKey]);

  const versions = useMemo(() => (detail && detail.logical === logical ? detail.versions : []), [detail, logical]);
  const current: Version | undefined = versions.find(v => v.ref === picked)
    || [...versions].reverse().find(v => v.status !== "deprecated") || versions[versions.length - 1];
  const live = versions.find(v => v.status === "canonical");
  const newest = versions[versions.length - 1];
  const label = detail?.label || "";

  const pick = useCallback((ref: string) => { setPicked(ref); setNotice(null); setConfirm(null); setRefused(null); setQuote(null); }, []);

  // ←/→ flips versions while reading (not while typing anywhere).
  useEffect(() => {
    if (mode === "edit" || !current) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as Node;
      if (t !== document.body && !root.current?.contains(t)) return;
      const i = versions.findIndex(v => v.ref === current.ref);
      const next = versions[i + (e.key === "ArrowLeft" ? -1 : 1)];
      if (next) { e.preventDefault(); pick(next.ref); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, current, versions, pick]);

  // Keep the picked chip in view.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[data-current=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current?.ref]);

  if (error && !current) return <p className="p-6 text-sm text-fusion">{error}</p>;
  if (!current) return <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted"><LoaderCircle size={16} aria-hidden className="me-2 animate-spin" />加载中…</div>;

  const chatRef = (v: Version): ChatRef => ({ ref: v.ref, label: `${label} ${shortVersion(v.ref)}`, project_id: projectId });
  const images = current.media.filter(isImage);
  const body = bodyOf(current);
  const baseVersion = versions.find(v => v.ref === base)
    || (current.revision_of ? versions.find(v => sameVersion(v.ref, current.revision_of!)) : undefined)
    || versions[versions.findIndex(v => v.ref === current.ref) - 1];
  const canDiff = Boolean(body && versions.some(v => v.ref !== current.ref && bodyOf(v)));

  const run = async (action: Action, target: string, confirmed = false, allowDraft = false) => {
    setWorking(true); setNotice(null); setRefused(null);
    try {
      const result = await api.action(projectId, { action, ref: target, confirm: confirmed || undefined, allow_draft: allowDraft || undefined });
      if (!result.ok && "needs_confirm" in result) {
        setConfirm({ action, ref: target, impacts: result.impacts, allowDraft });
        return;
      }
      setConfirm(null);
      const marked = result.ok ? result.marked || 0 : 0;
      setNotice({
        text: result.ok && result.unchanged ? `${shortVersion(target)} 已经是${STATUS_LABEL[result.status] || result.status}`
          : action === "canonical" ? `${shortVersion(target)} 已生效，下游会以它为准${marked ? `；${marked} 项下游标成了过期` : ""}`
          : `已${ACTION_TEXT[action]} ${shortVersion(target)}${marked ? `，${marked} 项下游标成了过期` : ""}`,
        actions: marked && connected ? [{ label: "让主创更新下游", run: () => onSend(`${label} 换成了 ${shortVersion(target)}，把过期的下游更新一下。`, [{ ...chatRef(current), ref: target }]) }] : undefined,
      });
      onChanged();
    } catch (e) {
      setConfirm(null);
      if (e instanceof ActionRefused) setRefused({ action, ref: target, message: e.message, problems: e.problems });
      else setNotice({ text: apiErrorMessage(e, `${ACTION_TEXT[action]}失败`), error: true });
    } finally {
      setWorking(false);
    }
  };

  const save = async (text: string, fields: string, thenCanonical: boolean) => {
    setWorking(true); setSaveError("");
    try {
      const result = await api.edit(projectId, { ref: current.ref, body: text, fields: current.fields !== undefined ? fields : undefined });
      onDirty(false);
      setMode("read");
      if (result.unchanged) { setNotice({ text: "没有改动" }); return; }
      setPicked(result.ref);
      const v = shortVersion(result.ref);
      const warnings = result.warnings?.length ? `（提醒：${result.warnings.join("；")}）` : "";
      setNotice({
        text: `已存为 ${v}（草稿）${warnings}`,
        actions: [
          ...(thenCanonical ? [] : [{ label: "设为生效", primary: true, run: () => void run("canonical", result.ref) }]),
          ...(connected ? [{ label: "让主创看看", run: () => onSend(`我改了${label}，存成了 ${v}。看看还有哪里要顺着调整。`, [{ ref: result.ref, label: `${label} ${v}`, project_id: projectId }]) }] : []),
        ],
      });
      onChanged();
      if (thenCanonical) await run("canonical", result.ref);
    } catch (e) {
      setSaveError(e instanceof ActionRefused ? [e.message, ...e.problems].join("；") : apiErrorMessage(e, "保存失败"));
    } finally {
      setWorking(false);
    }
  };

  const selectQuote = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    const box = reader.current;
    if (!sel || !text || !box || !sel.rangeCount || !box.contains(sel.anchorNode)) { setQuote(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    setQuote({ x: Math.min(Math.max(rect.left + rect.width / 2 - outer.left, 48), outer.width - 48), y: rect.top - outer.top + box.scrollTop, text });
  };

  const tone = toneOf(current.status);
  const author = authorLabel(current.created_by);
  const revisionOf = current.revision_of ? versions.find(v => sameVersion(v.ref, current.revision_of!)) : undefined;

  return (
    <div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header: name, versions, actions. */}
      <div className="shrink-0 space-y-2 border-b border-border-solid px-4 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <div draggable onDragStart={e => dragRef(e, chatRef(current))} title="拖到对话 = 引用这一版"
            className="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing">
            <KindIcon kind={status?.items.find(i => i.logical === logical)?.kind || ""} className="shrink-0 text-muted" />
            <h2 className="truncate font-medium text-heading">{label}</h2>
          </div>
          <button type="button" onClick={() => onRef(chatRef(current))} title="把这一版放进对话的引用里"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-primary">
            <MessageSquarePlus size={13} aria-hidden />引用到对话
          </button>
        </div>

        <div ref={strip} role="tablist" aria-label="版本" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
          {versions.map(v => {
            const on = v.ref === current.ref;
            const t = toneOf(v.status);
            return (
              <button key={v.ref} type="button" role="tab" aria-selected={on} data-current={on} onClick={() => pick(v.ref)}
                draggable onDragStart={e => dragRef(e, chatRef(v))}
                title={`${shortVersion(v.ref)} · ${STATUS_LABEL[v.status] || v.status}${v.created_by ? ` · ${authorLabel(v.created_by)}` : ""}${v.created_at ? ` · ${timeLabel(v.created_at)}` : ""}\n拖到对话 = 引用`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums transition-colors ${on
                  ? "border-primary bg-primary/10 text-heading"
                  : `border-border-solid text-body hover:border-primary/60 ${t === "deprecated" ? "opacity-50" : ""}`}`}>
                <StatusDot tone={t} />
                <span className={t === "deprecated" ? "line-through" : ""}>{shortVersion(v.ref)}</span>
                {t === "canonical" && <span className="text-[10px] text-spark-mint">生效</span>}
                {v.created_by === "user" && <span className="text-[10px] text-spark-blue" title="你改的">你</span>}
              </button>
            );
          })}
          {versions.length > 1 && <span className="ms-1 shrink-0 text-[10px] text-dim">←/→ 切换</span>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <StatusPill tone={tone} />
          {author && <span>{author}</span>}
          {current.created_at && <span>· {timeLabel(current.created_at)}</span>}
          {revisionOf && <span>· 改自 <button type="button" onClick={() => pick(revisionOf.ref)} className="text-body hover:text-primary hover:underline">{shortVersion(revisionOf.ref)}</button></span>}
          {live && live.ref !== current.ref && (
            <span>· 生效的是 <button type="button" onClick={() => pick(live.ref)} className="text-spark-mint hover:underline">{shortVersion(live.ref)}</button></span>
          )}
          {newest && newest.ref !== current.ref && newest.status !== "deprecated" && newest !== live && (
            <span>· 最新 <button type="button" onClick={() => pick(newest.ref)} className="text-spark-blue hover:underline">{shortVersion(newest.ref)}</button></span>
          )}
        </div>

        {mode !== "edit" && (
          <div className="flex flex-wrap items-center gap-2">
            {current.status === "canonical" ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-md bg-spark-mint/10 px-2.5 py-1 text-xs text-spark-mint"><Check size={13} aria-hidden />正在生效</span>
                <button type="button" disabled={working} onClick={() => run("uncanonical", current.ref)} title="退回草稿；下游不再以它为准"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-heading disabled:opacity-40"><Undo2 size={12} aria-hidden />取消生效</button>
              </>
            ) : (
              <button type="button" disabled={working || current.status === "deprecated"} onClick={() => run("canonical", current.ref)}
                title={live ? `用 ${shortVersion(current.ref)} 替换现在生效的 ${shortVersion(live.ref)}` : "下游会以这一版为准"}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg transition-colors hover:bg-accent disabled:opacity-40">
                <Check size={13} aria-hidden />设为生效
              </button>
            )}
            {current.editable && (
              <button type="button" disabled={working} onClick={() => { setMode("edit"); setSaveError(""); setNotice(null); }}
                className="inline-flex items-center gap-1 rounded-md border border-border-solid px-2.5 py-1 text-xs text-body transition-colors hover:border-primary hover:text-primary disabled:opacity-40">
                <Pencil size={12} aria-hidden />编辑
              </button>
            )}
            {canDiff && (
              <button type="button" aria-pressed={mode === "diff"} onClick={() => setMode(m => (m === "diff" ? "read" : "diff"))}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${mode === "diff" ? "border-spark-blue/60 bg-spark-blue/10 text-spark-blue" : "border-border-solid text-body hover:border-primary hover:text-primary"}`}>
                <GitCompare size={12} aria-hidden />对比
              </button>
            )}
            {images.length > 0 && (
              <button type="button" disabled={busy || !connected} onClick={() => onSend(`${label}再出 3 张候选，参考 ${shortVersion(current.ref)}。`, [chatRef(current)])}
                className="inline-flex items-center gap-1 rounded-md border border-border-solid px-2.5 py-1 text-xs text-body transition-colors hover:border-primary hover:text-primary disabled:opacity-40">
                <Images size={12} aria-hidden />再出 3 张
              </button>
            )}
            <span className="flex-1" />
            {current.status !== "deprecated" && (
              <button type="button" disabled={working} onClick={() => run("deprecate", current.ref)} title="这一版不要了（不会删除，随时能看）"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-dim transition-colors hover:bg-fusion/10 hover:text-fusion disabled:opacity-40">
                <Ban size={12} aria-hidden />弃用
              </button>
            )}
            {working && <LoaderCircle size={14} aria-hidden className="animate-spin text-muted" />}
          </div>
        )}

        {notice && (
          <div role="status" className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-1.5 text-xs animate-in fade-in ${notice.error ? "bg-fusion/10 text-fusion" : "bg-surface-2 text-body"}`}>
            <span className="min-w-0 flex-1">{notice.text}</span>
            {notice.actions?.map(a => (
              <button key={a.label} type="button" disabled={working} onClick={() => { a.run(); setNotice(null); }}
                className={a.primary ? "rounded bg-primary px-2 py-0.5 font-medium text-bg disabled:opacity-40" : "rounded border border-border-solid px-2 py-0.5 hover:border-primary hover:text-primary disabled:opacity-40"}>{a.label}</button>
            ))}
            <button type="button" onClick={() => setNotice(null)} aria-label="关闭" className="text-muted hover:text-heading"><X size={12} aria-hidden /></button>
          </div>
        )}

        {confirm && (
          <div role="alertdialog" aria-label="确认影响" className="rounded-lg border border-spark-flare/50 bg-spark-flare/5 p-3 text-xs animate-in fade-in">
            <p className="font-medium text-heading">{ACTION_TEXT[confirm.action]} {shortVersion(confirm.ref)} 会让 {confirm.impacts.items.length} 项下游过期：</p>
            <ul className="mt-1 space-y-0.5 text-body">
              {confirm.impacts.summary.map(s => <li key={s.kind}>· {s.label || s.kind} ×{s.count}</li>)}
            </ul>
            <p className="mt-1 text-muted">过期不会删除它们，只是提醒要按新的版本更新。</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={working} onClick={() => run(confirm.action, confirm.ref, true, confirm.allowDraft)}
                className="rounded-md bg-primary px-3 py-1 font-medium text-bg disabled:opacity-40">确认{ACTION_TEXT[confirm.action]}</button>
              <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-border-solid px-3 py-1 text-body">算了</button>
            </div>
          </div>
        )}
        {refused && (
          <div role="alert" className="rounded-lg border border-fusion/40 bg-fusion/5 p-3 text-xs animate-in fade-in">
            <p className="font-medium text-fusion">{refused.message}</p>
            {refused.problems.length > 0 && <ul className="mt-1 list-disc space-y-0.5 ps-4 text-body">{refused.problems.map(p => <li key={p}>{p}</li>)}</ul>}
            <div className="mt-2 flex flex-wrap gap-2">
              {refused.action === "canonical" && (
                <button type="button" disabled={working} onClick={() => run("canonical", refused.ref, false, true)}
                  className="rounded-md border border-border-solid px-3 py-1 text-body hover:border-primary">依赖还是草稿，也照样生效</button>
              )}
              <button type="button" disabled={busy || !connected} onClick={() => { onSend(`${label} ${shortVersion(refused.ref)} 还不能生效：${refused.problems.join("；") || refused.message}。帮我补上。`, [chatRef(current)]); setRefused(null); }}
                className="rounded-md border border-border-solid px-3 py-1 text-body hover:border-primary disabled:opacity-40">让主创补上</button>
              <button type="button" onClick={() => setRefused(null)} className="ms-auto text-muted hover:text-heading">关闭</button>
            </div>
          </div>
        )}
      </div>

      {/* Body. */}
      <div ref={reader} onMouseUp={mode === "read" ? selectQuote : undefined} onMouseDown={() => setQuote(null)} onScroll={() => setQuote(null)}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mode === "edit" ? (
          <TextEditor key={current.ref} version={current} saving={working} error={saveError}
            onCancel={() => { setMode("read"); onDirty(false); }} onSave={(t, f, c) => void save(t, f, c)} onDirty={onDirty} />
        ) : mode === "diff" && baseVersion ? (
          <DiffView versions={versions} current={current} base={baseVersion} onBase={setBase} />
        ) : (
          <>
            <MediaGrid media={current.media} src={api.mediaSrc} large
              refOf={(item, i) => ({ ref: mediaPath(item.url), label: `${label} ${shortVersion(current.ref)} 第 ${i + 1} 张`, project_id: projectId })}
              onPick={images.length > 1 && connected && !busy ? (_item, index) => onSend(`${label} ${shortVersion(current.ref)} 选第 ${index + 1} 张。`, [chatRef(current)]) : undefined} />
            {body && (
              <article className={`mx-auto max-w-3xl ${current.media.length ? "mt-4" : ""} ${current.status === "deprecated" ? "opacity-60" : ""}`}>
                <ArticleBody text={body} />
              </article>
            )}
            {current.text && !current.editable && (
              <p className="mx-auto mt-4 max-w-3xl text-[11px] text-dim">这一版太长，页面上不能直接改；在对话里告诉主创要改哪里。</p>
            )}
            {current.fields && (
              <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-border-solid bg-surface/50">
                <button type="button" onClick={() => setShowFields(s => !s)} aria-expanded={showFields}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-muted hover:text-heading">
                  {showFields ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}字段
                </button>
                {showFields && <pre className="overflow-x-auto border-t border-border-solid px-3 py-2 font-mono text-xs leading-5 text-body">{current.fields}</pre>}
              </div>
            )}
            {!body && !current.media.length && <p className="text-sm text-muted">这一版没有可显示的内容。</p>}
            <Relations version={current} status={status} onOpen={onOpen} />
          </>
        )}
        {quote && mode === "read" && (
          <button type="button" style={{ left: quote.x, top: Math.max(quote.y - 36, 4) }}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onMouseUp={e => e.stopPropagation()}
            onClick={() => { onQuote(chatRef(current), quote.text); setQuote(null); window.getSelection()?.removeAllRanges(); }}
            className="absolute z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-md border border-primary/50 bg-surface-3 px-2.5 py-1 text-xs text-primary shadow-lg animate-in fade-in zoom-in-95">
            <Quote size={12} aria-hidden />引用这段问主创
          </button>
        )}
      </div>
    </div>
  );
}

function DiffView({ versions, current, base, onBase }: { versions: Version[]; current: Version; base: Version; onBase: (ref: string) => void }) {
  const lines = useMemo(() => lineDiff(bodyOf(base), bodyOf(current)), [base, current]);
  const others = versions.filter(v => v.ref !== current.ref && bodyOf(v));
  const added = lines?.filter(l => l.kind === "add").length || 0;
  const removed = lines?.filter(l => l.kind === "del").length || 0;
  return (
    <div className="mx-auto max-w-3xl text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <label htmlFor="series-diff-base">对比</label>
        <select id="series-diff-base" value={base.ref} onChange={e => onBase(e.target.value)}
          className="rounded-md border border-border-solid bg-surface px-1.5 py-0.5 text-xs text-heading">
          {others.map(v => <option key={v.ref} value={v.ref}>{shortVersion(v.ref)}{v.status === "canonical" ? "（生效）" : ""}</option>)}
        </select>
        <span>→ {shortVersion(current.ref)}</span>
        {lines && <span className="ms-auto tabular-nums"><span className="text-spark-mint">+{added}</span> <span className="text-fusion">−{removed}</span> 行</span>}
      </div>
      {!lines ? <p className="text-muted">两版都太长，页面上比不了；在对话里让主创说说改了什么。</p>
        : !added && !removed ? <p className="text-muted">两版正文一样。</p>
        : (
          <div className="overflow-hidden rounded-lg border border-border-solid font-body text-[13px] leading-6">
            {foldDiff(lines).map((l, i) => l.kind === "fold"
              ? <div key={i} className="bg-surface-2/60 px-3 py-0.5 text-[11px] text-dim">⋯ {l.count} 行没变</div>
              : (
                <div key={i} className={`whitespace-pre-wrap break-words px-3 ${l.kind === "add" ? "bg-spark-mint/10 text-heading" : l.kind === "del" ? "bg-fusion/10 text-muted line-through decoration-fusion/40" : "text-body"}`}>
                  <span aria-hidden className="me-2 inline-block w-3 select-none text-dim">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>{l.text || " "}
                </div>
              ))}
          </div>
        )}
    </div>
  );
}

function Relations({ version, status, onOpen }: { version: Version; status: ProjectStatus | null; onOpen: (ref: string) => void }) {
  const [all, setAll] = useState(false);
  if (!version.depends_on.length && !version.downstream.length) return null;
  const chip = (ref: string) => (
    <button key={ref} type="button" onClick={() => onOpen(ref)} title={ref} draggable
      onDragStart={e => dragRef(e, { ref, label: refLabel(status, ref), project_id: status?.project_id })}
      className="rounded-md border border-border-solid bg-surface px-2 py-0.5 text-[11px] text-body transition-colors hover:border-primary hover:text-primary">
      {refLabel(status, ref)}
    </button>
  );
  const downstream = all ? version.downstream : version.downstream.slice(0, 8);
  return (
    <dl className="mx-auto mt-6 max-w-3xl space-y-2 border-t border-border-solid pt-3 text-xs">
      {version.depends_on.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5"><dt className="me-1 text-muted">依据</dt><dd className="contents">{version.depends_on.map(chip)}</dd></div>
      )}
      {version.downstream.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="me-1 text-muted">下游 {version.downstream.length}</dt>
          <dd className="contents">
            {downstream.map(chip)}
            {version.downstream.length > 8 && (
              <button type="button" onClick={() => setAll(a => !a)} className="text-[11px] text-muted hover:text-primary">{all ? "收起" : `还有 ${version.downstream.length - 8} 项`}</button>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
