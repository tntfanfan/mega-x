import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, RotateCcw, Square, X } from "lucide-react";
import { Markdown } from "../../../components/ui/Markdown";
import type { Ask, AskAnswer, ChatRef, MediaItem, Message } from "../api";
import type { Live, Pending, Stream } from "../useChat";
import type { ConnectionState } from "../socket";
import { AskCard } from "./AskCard";
import { MediaGrid } from "./MediaGrid";
import { REF_MIME } from "./ProjectTree";

const REF_LIMIT = 8;

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
  const out: Bubble[] = messages.map(m => ({
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

/** 中间栏：聊天。`ask` 渲染成问题卡片（AskCard）；用户消息可以 ⟳ 重发；■ 停止当前一轮。 */
export function ChatPane({ title, messages, live, pending, conn, error, busy, refs, setRefs, mediaSrc, onSend, onAnswer, onCancel, onRetry, onClearError }: {
  title: string;
  messages: Message[];
  live: Live | null;
  pending: Pending[];
  conn: ConnectionState;
  error: string;
  busy: boolean;
  refs: ChatRef[];
  setRefs: (refs: ChatRef[]) => void;
  mediaSrc: (url: string) => string;
  onSend: (text: string, refs: ChatRef[], resendOf?: string) => boolean;
  onAnswer: (ask: Ask, answers: AskAnswer[]) => boolean;
  onCancel: () => void;
  onRetry: () => void;
  onClearError: () => void;
}) {
  const [text, setText] = useState("");
  const [dropping, setDropping] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const items = bubbles(messages, live, pending);
  const lastAssistant = [...items].reverse().find(b => b.role === "assistant" && !b.live);
  const lastIsAssistant = items.length > 0 && items[items.length - 1].role === "assistant";
  const notice = connText(conn);
  const connected = conn.kind === "open";

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages.length === 0]);

  const addRef = (ref: ChatRef) => {
    if (refs.some(r => r.ref === ref.ref) || refs.length >= REF_LIMIT) return;
    setRefs([...refs, ref]);
  };
  const submit = () => {
    if (busy || !connected || !text.trim()) return;
    if (onSend(text, refs)) { setText(""); setRefs([]); }
  };
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropping(false);
    const raw = event.dataTransfer.getData(REF_MIME);
    if (!raw) return;
    try { addRef(JSON.parse(raw)); } catch { /* not ours */ }
  };

  return (
    <section aria-label="聊天" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {notice && (
        <div role="status" className={`flex items-center gap-3 border-b border-border-solid px-4 py-2 text-xs ${conn.kind === "fatal" ? "text-fusion" : "text-muted"}`}>
          {conn.kind !== "fatal" && <LoaderCircle size={13} aria-hidden className="animate-spin" />}
          <span className="flex-1">{notice}</span>
          {conn.kind !== "fatal" && conn.kind !== "connecting" && <button type="button" onClick={onRetry} className="text-primary hover:underline">立即重试</button>}
        </div>
      )}
      <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!items.length && <p className="pt-10 text-center text-sm text-muted">跟{title}说说你想做一部什么样的剧。</p>}
        {items.map(b => (
          <div key={b.id} className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`group max-w-[85%] rounded-xl px-3 py-2 text-sm ${b.role === "user" ? `bg-primary/15 text-heading ${b.pending ? "opacity-60" : ""}` : "bg-surface text-body border border-border-solid"}`}>
              {b.role === "assistant" && b.label && <div className="mb-1 text-[11px] text-muted">{b.label}</div>}
              {b.refs?.length ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {b.refs.map(r => <span key={r.ref} title={r.ref} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">📎 {r.label || r.ref}</span>)}
                </div>
              ) : null}
              {b.text ? <Markdown text={b.text} /> : null}
              {b.live && !b.text && <p className="text-xs text-muted">{b.thinking || live?.tool || (live?.queued ? `排队中，前面还有 ${live.queued - 1} 个` : "思考中…")}</p>}
              {b.live && b.text && (b.thinking || live?.tool) && <p className="mt-1 text-xs text-muted">{b.thinking || live?.tool}</p>}
              {b.error && <p className="text-xs text-fusion">{b.error}</p>}
              <MediaGrid media={b.media || []} src={mediaSrc} />
              {(b.asks || []).map((ask, index) => (
                <AskCard key={ask.id || index} ask={ask} onAnswer={onAnswer}
                  answerable={Boolean(ask.id) && !busy && connected && (Boolean(b.live) || (b === lastAssistant && lastIsAssistant))} />
              ))}
              {b.resendable && (
                <div className="mt-1 hidden justify-end group-hover:flex">
                  <button type="button" disabled={busy || !connected} onClick={() => onSend("", [], b.id)} title="二次发送：把这条消息再发一遍"
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary disabled:opacity-40">
                    <RotateCcw size={11} aria-hidden />重发
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {live?.error && !live.done && <p className="text-center text-xs text-fusion">{live.error}</p>}
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 border-t border-border-solid px-4 py-1.5 text-xs text-fusion">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={onClearError} aria-label="关闭"><X size={13} aria-hidden /></button>
        </div>
      )}
      <div className="border-t border-border-solid p-3">
        <div onDragOver={e => { if (e.dataTransfer.types.includes(REF_MIME)) { e.preventDefault(); setDropping(true); } }}
          onDragLeave={() => setDropping(false)} onDrop={drop}
          className={`rounded-xl border bg-surface/60 p-2 transition-colors ${dropping ? "border-primary bg-primary/5" : "border-border-solid focus-within:border-primary/60"}`}>
          {refs.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {refs.map(r => (
                <span key={r.ref} title={r.ref} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-body">
                  📎 {r.label || r.ref}
                  <button type="button" aria-label={`移除引用 ${r.label || r.ref}`} onClick={() => setRefs(refs.filter(x => x.ref !== r.ref))}><X size={11} aria-hidden /></button>
                </span>
              ))}
            </div>
          )}
          <textarea aria-label="消息" rows={2} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
            placeholder={dropping ? "松开即可引用" : "输入…（把左栏或右栏的产出物拖进来 = 引用）"}
            className="block w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-body outline-none placeholder:text-muted" />
          <div className="flex items-center justify-end gap-2">
            {busy && live && !live.done && (
              <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-md border border-border-solid px-2.5 py-1 text-xs text-body hover:border-fusion hover:text-fusion">
                <Square size={11} aria-hidden />停止
              </button>
            )}
            <button type="button" onClick={submit} disabled={busy || !connected || !text.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">
              {busy ? <LoaderCircle size={12} aria-hidden className="animate-spin" /> : <ArrowUp size={12} aria-hidden />}发送
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
