import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, AtSign, LoaderCircle, Paperclip, RotateCcw, Search, Sparkles, Square, X } from "lucide-react";
import { Markdown } from "../../../components/ui/Markdown";
import type { Ask, AskAnswer, ChatRef, MediaItem, Message, ProjectStatus } from "../api";
import type { Live, Pending, Stream } from "../useChat";
import type { ConnectionState } from "../socket";
import { dragRef, isRefDrag, mediaPath, readDrop, useRefDragging } from "../drag";
import { itemRef, itemState, refLabel } from "../stages";
import { openAskBubble } from "../askTarget";
import { AskCard } from "./AskCard";
import { KindIcon, Popover, StatusDot } from "./bits";
import { MediaGrid } from "./MediaGrid";

export const REF_LIMIT = 8;
export type Draft = { text: string; refs: ChatRef[] };

type Bubble = {
  id: string;
  role: "user" | "assistant";
  label?: string;
  text: string;
  refs?: ChatRef[];
  media?: MediaItem[];
  asks?: Ask[];
  error?: string;
  thinking?: string;
  pending?: boolean;
  live?: boolean;
  resendable?: boolean;
};

function bubbles(messages: Message[], live: Live | null, pending: Pending[]): Bubble[] {
  // An answer shows inside its ask card; only a reply to an ask we can't see stays a bubble.
  const asks = new Set(messages.flatMap(m => (m.asks || []).map(a => a.id).filter(Boolean)));
  const out: Bubble[] = messages.filter(m => !(m.role === "user" && m.answer_to && asks.has(m.answer_to))).map(m => ({
    id: m.id, role: m.role, label: m.role === "assistant" ? m.label : undefined, text: m.text,
    refs: m.refs, media: m.media, asks: m.asks, error: m.error, resendable: m.role === "user",
  }));
  if (live && !live.done) {
    for (const key of live.order) {
      const s: Stream = live.streams[key];
      out.push({ id: `live:${key}`, role: "assistant", label: s.label, text: s.text, media: s.media, asks: s.asks, thinking: s.thinking, live: true });
    }
  }
  for (const p of pending) out.push({ id: `pending:${p.clientMessageId}`, role: "user", text: p.text, refs: p.refs, pending: true });
  return out;
}

function connText(conn: ConnectionState): string | null {
  switch (conn.kind) {
    case "open": return null;
    case "connecting": return conn.attempt > 1 ? `正在重新连接（第 ${conn.attempt} 次）…` : "正在连接…";
    case "unavailable": return "部门应用尚未启动 / 正在重启，稍后自动重连";
    case "reconnecting": return `${conn.reason}，正在重新连接…`;
    case "fatal": return conn.reason;
  }
}

const REF_IN_TEXT = /(?<![\w/.-])`?((?:[\w.-]+\/)*[\w.-]+\.v\d{3,}\.[a-z0-9]+(?:@v\d+)?)`?/gi;
export const REF_HREF = "#series-ref=";

/** Artifact refs the agent mentions (`story/…/script-ep-001.v002.md@v2`) become links the page turns into chips. */
function linkRefs(text: string, status: ProjectStatus | null): string {
  return text.split(/(```[\s\S]*?(?:```|$))/).map((part, i) => (i % 2
    ? part
    : part.replace(REF_IN_TEXT, (_m, ref: string) => `[${refLabel(status, ref).replace(/[[\]]/g, "")}](${REF_HREF}${encodeURIComponent(ref)})`))).join("");
}

function RefChip({ chatRef, onOpen, onRemove, children }: { chatRef: ChatRef; onOpen?: (ref: string) => void; onRemove?: () => void; children?: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border-solid bg-surface-2 px-1.5 py-px align-baseline text-[12px] text-body">
      <button type="button" draggable onDragStart={e => dragRef(e, chatRef)} onClick={() => onOpen?.(chatRef.ref)} title={`${chatRef.ref}\n点开查看`}
        className="inline-flex min-w-0 items-center gap-1 hover:text-primary">
        <Paperclip size={11} aria-hidden className="shrink-0 text-muted" />
        <span className="truncate">{children ?? chatRef.label ?? chatRef.ref}</span>
      </button>
      {onRemove && <button type="button" aria-label={`移除引用 ${chatRef.label || chatRef.ref}`} onClick={onRemove} className="text-muted hover:text-fusion"><X size={11} aria-hidden /></button>}
    </span>
  );
}

/** 左栏：对话（会话切换在页面顶栏）。产出物可以拖进来、@ 选进来，或者从右边「引用到对话」。 */
export function ChatPane(props: {
  title: string;
  messages: Message[];
  live: Live | null;
  pending: Pending[];
  conn: ConnectionState;
  error: string;
  busy: boolean;
  draft: Draft;
  setDraft: (update: (d: Draft) => Draft) => void;
  focusTick: number;
  status: ProjectStatus | null;
  sid: string;
  mediaSrc: (url: string) => string;
  onOpenRef: (ref: string) => void;
  onSend: (text: string, refs: ChatRef[], resendOf?: string) => boolean;
  onAnswer: (ask: Ask, answers: AskAnswer[]) => boolean;
  onCancel: () => void;
  onRetry: () => void;
  onClearError: () => void;
}) {
  const { title, messages, live, pending, conn, error, busy, draft, setDraft, status, mediaSrc, onSend, onAnswer, onOpenRef } = props;
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const dragging = useRefDragging();
  const [over, setOver] = useState(false);
  const items = bubbles(messages, live, pending);
  const question = openAskBubble(items);
  const notice = connText(conn);
  const connected = conn.kind === "open";
  const answers = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of messages) if (m.role === "user" && m.answer_to) out[m.answer_to] = m.text;
    return out;
  }, [messages]);
  const waitingAsk = Boolean(question?.asks?.some(a => a.id && !answers[a.id]));

  // Stick to the bottom while the reply streams, unless the user scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; setAtBottom(true); }, [props.sid]);
  const onScroll = () => {
    const el = list.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  // Autosize the composer; focus it when the page puts something in (a quote, a suggestion).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [draft.text]);
  useEffect(() => {
    if (!props.focusTick || !input.current) return;
    const el = input.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [props.focusTick]);

  const addRef = (ref: ChatRef) => setDraft(d => (d.refs.some(r => r.ref === ref.ref) || d.refs.length >= REF_LIMIT ? d : { ...d, refs: [...d.refs, ref] }));
  const submit = () => {
    if (busy || !connected || !draft.text.trim()) return;
    if (onSend(draft.text, draft.refs)) { setDraft(() => ({ text: "", refs: [] })); setAtBottom(true); }
  };
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    setOver(false);
    const ref = readDrop(event);
    if (ref) { addRef(ref); input.current?.focus(); }
  };
  const renderLink = (href: string, children: ReactNode) => {
    if (!href.startsWith(REF_HREF)) return undefined;
    const ref = decodeURIComponent(href.slice(REF_HREF.length));
    return <RefChip chatRef={{ ref, label: refLabel(status, ref), project_id: status?.project_id }} onOpen={onOpenRef}>{children}</RefChip>;
  };

  return (
    <section aria-label="对话" onDragOver={e => { if (isRefDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }} onDrop={drop}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {notice && (
        <div role="status" className={`flex items-center gap-3 border-b border-border-solid px-4 py-1.5 text-xs ${conn.kind === "fatal" ? "text-fusion" : "text-muted"}`}>
          {conn.kind !== "fatal" && <LoaderCircle size={13} aria-hidden className="animate-spin" />}
          <span className="flex-1">{notice}</span>
          {conn.kind !== "fatal" && conn.kind !== "connecting" && <button type="button" onClick={props.onRetry} className="text-primary hover:underline">立即重试</button>}
        </div>
      )}

      <div ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
          {!items.length && <EmptyChat title={title} hasProject={Boolean(status)} onPick={text => { setDraft(d => ({ ...d, text })); input.current?.focus(); }} />}
          {items.map((b, i) => {
            const prev = items[i - 1];
            const showLabel = b.role === "assistant" && b.label && (prev?.role !== "assistant" || prev.label !== b.label);
            if (b.role === "user") {
              return (
                <div key={b.id} className="group flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1">
                  <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-primary/[0.13] px-3.5 py-2 text-sm text-heading ${b.pending ? "opacity-60" : ""}`}>
                    {b.refs?.length ? <div className="mb-1.5 flex flex-wrap gap-1">{b.refs.map(r => <RefChip key={r.ref} chatRef={r} onOpen={onOpenRef} />)}</div> : null}
                    <div className="whitespace-pre-wrap break-words leading-relaxed">{b.text}</div>
                  </div>
                  {b.resendable && (
                    <button type="button" disabled={busy || !connected} onClick={() => onSend("", [], b.id)} title="把这条消息再发一遍"
                      className="inline-flex items-center gap-1 text-[11px] text-dim opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 disabled:opacity-0">
                      <RotateCcw size={11} aria-hidden />重发
                    </button>
                  )}
                </div>
              );
            }
            return (
              <div key={b.id} className="min-w-0 text-sm text-body">
                {showLabel && <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted"><Sparkles size={11} aria-hidden className="text-primary/70" />{b.label}</div>}
                {b.text ? <Markdown text={linkRefs(b.text, status)} renderLink={renderLink} /> : null}
                {b.live && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <LoaderCircle size={12} aria-hidden className="animate-spin text-primary/70" />
                    <span className="truncate">{b.thinking || live?.tool || (live?.queued ? `排队中，前面还有 ${live.queued - 1} 个` : b.text ? "继续写…" : "思考中…")}</span>
                  </p>
                )}
                {b.error && <p className="mt-1 text-xs text-fusion">{b.error}</p>}
                <MediaGrid media={b.media || []} src={mediaSrc}
                  refOf={(item, n) => ({ ref: mediaPath(item.url), label: `${b.label || "回复"}里的第 ${n + 1} 张`, project_id: status?.project_id })} />
                {(b.asks || []).map((ask, index) => (
                  <AskCard key={ask.id || index} ask={ask} onAnswer={onAnswer} answer={ask.id ? answers[ask.id] : undefined}
                    answerable={Boolean(ask.id) && !busy && connected && (Boolean(b.live) || b === question)} />
                ))}
              </div>
            );
          })}
          {live?.error && !live.done && <p className="text-center text-xs text-fusion">{live.error}</p>}
        </div>
      </div>

      {!atBottom && items.length > 0 && (
        <button type="button" onClick={() => { setAtBottom(true); list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }}
          className="absolute bottom-36 start-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-solid bg-surface-2 px-3 py-1 text-xs text-body shadow-lg hover:text-primary">
          <ArrowDown size={12} aria-hidden />{busy ? "正在回复" : "回到最新"}
        </button>
      )}

      {error && (
        <div role="alert" className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-1.5 text-xs text-fusion">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={props.onClearError} aria-label="关闭"><X size={13} aria-hidden /></button>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-3 pb-3 pt-1">
        <div className="rounded-2xl border border-border-solid bg-surface/80 p-2 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] transition-colors focus-within:border-primary/50">
          {draft.refs.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1 px-1 pt-0.5">
              {draft.refs.map(r => <RefChip key={r.ref} chatRef={r} onOpen={onOpenRef} onRemove={() => setDraft(d => ({ ...d, refs: d.refs.filter(x => x.ref !== r.ref) }))} />)}
            </div>
          )}
          <textarea ref={input} aria-label="消息" rows={1} value={draft.text} onChange={e => { const text = e.target.value; setDraft(d => ({ ...d, text })); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
            placeholder={waitingAsk ? "点上面的选项，或者直接打字回答…" : draft.refs.length ? "就引用的内容问点什么…" : `跟${title}说点什么…`}
            className="block max-h-[40vh] min-h-[2.5rem] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-relaxed text-heading outline-none placeholder:text-dim" />
          <div className="flex items-center gap-1">
            <div className="shrink-0"><RefPicker status={status} picked={draft.refs} onPick={addRef} /></div>
            <span className={`min-w-0 flex-1 truncate px-1 text-[11px] text-dim ${busy ? "invisible" : ""}`}>Enter 发送 · Shift+Enter 换行 · 把产出物拖进来就是引用</span>
            {busy && live && !live.done && (
              <button type="button" onClick={props.onCancel} title="停止这一轮"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border-solid px-2.5 py-1 text-xs text-body hover:border-fusion hover:text-fusion">
                <Square size={10} aria-hidden className="fill-current" />停止
              </button>
            )}
            <button type="button" onClick={submit} disabled={busy || !connected || !draft.text.trim()} aria-label="发送"
              title={busy ? "等这一轮回复完" : !connected ? "还没连上" : "发送（Enter）"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-bg transition-all hover:bg-accent disabled:bg-surface-3 disabled:text-dim">
              {busy ? <LoaderCircle size={15} aria-hidden className="animate-spin" /> : <ArrowUp size={16} aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      {dragging && (
        <div onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={`absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-[2px] transition-colors ${over ? "border-primary bg-primary/15" : "border-primary/40 bg-bg/60"}`}>
          <div className="pointer-events-none text-center">
            <Paperclip size={22} aria-hidden className="mx-auto text-primary" />
            <p className="mt-2 text-sm text-heading">松开，放进对话的引用里</p>
            <p className="mt-0.5 text-xs text-muted">然后接着问就行</p>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyChat({ title, hasProject, onPick }: { title: string; hasProject: boolean; onPick: (text: string) => void }) {
  const ideas = hasProject
    ? ["现在做到哪了？还差什么？", "写第 1 集剧本", "把主要人物整理出来，给主角出 3 张概念图", "看看哪些东西过期了，帮我更新"]
    : ["我想做一部 60 集的都市悬疑短剧", "先帮我想 3 个故事方向，我来挑", "我有一个小说想改编成网剧"];
  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles size={20} aria-hidden /></span>
      <p className="mt-3 font-display text-2xl text-heading">{hasProject ? "接着做点什么？" : "想做一部什么样的剧？"}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{title}会写、会画、会拍，也会先问你几个问题。右边的产出物随时可以拖进来接着聊。</p>
      <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {ideas.map(t => (
          <button key={t} type="button" onClick={() => onPick(t)}
            className="rounded-full border border-border-solid px-3 py-1.5 text-xs text-body transition-colors hover:border-primary/60 hover:text-primary">{t}</button>
        ))}
      </div>
    </div>
  );
}

/** 「@ 引用」：不拖也能把产出物放进引用。 */
function RefPicker({ status, picked, onPick }: { status: ProjectStatus | null; picked: ChatRef[]; onPick: (ref: ChatRef) => void }) {
  const [query, setQuery] = useState("");
  if (!status?.items.length) return null;
  const q = query.trim().toLowerCase();
  const shown = status.items.filter(i => !q || `${i.label} ${i.logical}`.toLowerCase().includes(q)).slice(0, 60);
  const full = picked.length >= REF_LIMIT;
  return (
    <Popover label="引用产出物" title={full ? `最多引用 ${REF_LIMIT} 项` : "引用产出物"} disabled={full} side="top"
      className="whitespace-nowrap rounded-full px-2 py-1 text-xs text-muted hover:text-primary"
      trigger={<><AtSign size={13} aria-hidden />引用</>}>
      {close => (
        <div className="flex max-h-[50vh] flex-col">
          <div className="flex items-center gap-2 border-b border-border-solid px-3 py-2">
            <Search size={13} aria-hidden className="text-muted" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="找产出物…" aria-label="找产出物"
              onKeyDown={e => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick({ ref: itemRef(shown[0]), label: shown[0].label, project_id: status.project_id }); close(); } }}
              className="min-w-0 flex-1 bg-transparent text-sm text-heading outline-none placeholder:text-dim" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {!shown.length && <p className="px-3 py-3 text-xs text-muted">没有匹配的产出物。</p>}
            {shown.map(item => {
              const ref = itemRef(item);
              const already = picked.some(p => p.ref === ref);
              return (
                <button key={item.logical} type="button" role="menuitem" disabled={already}
                  onClick={() => { onPick({ ref, label: item.label, project_id: status.project_id }); close(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-body transition-colors hover:bg-surface-3 disabled:opacity-40">
                  <KindIcon kind={item.kind} size={13} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <StatusDot tone={itemState(item)} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}
