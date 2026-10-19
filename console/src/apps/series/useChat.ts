/**
 * 一个会话的聊天状态：历史（应用存的）+ 正在进行的一轮（按 seq 合并帧）。
 *
 * 连上就先收到 `ready`：重新拉历史；有正在进行的一轮就 `subscribe(after)`，
 * 同一轮接着上次的 seq，别的轮从 0 开始（缓冲丢掉的部分由 `snapshot` 补上）。
 * 一轮结束（`result`）后历史里已经有这一轮的回复，拉一次历史再清掉进行中的状态。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../lib/api";
import { answerText, askQuestions } from "./api";
import type { Ask, AskAnswer, ChatRef, MediaItem, Message, SeriesApi } from "./api";
import { SeriesSocket, messageId, type ConnectionState, type Frame } from "./socket";

export type Stream = {
  key: string;
  source: string;
  label: string;
  text: string;
  media: MediaItem[];
  asks: Ask[];
  thinking?: string;
  ended?: boolean;
};

export type Live = {
  replyTo: string;
  seq: number;
  streams: Record<string, Stream>;
  order: string[];
  tool?: string;
  queued?: number;
  error?: string;
  done: boolean;
};

export type Pending = { clientMessageId: string; text: string; refs: ChatRef[] };

const PAGE_FRAMES = new Set(["artifact", "project", "job"]);

function newLive(replyTo: string): Live {
  return { replyTo, seq: 0, streams: {}, order: [], done: false };
}

function stream(live: Live, frame: Frame): Stream {
  const key = String(frame.key || "lead");
  let entry = live.streams[key];
  if (!entry) {
    entry = { key, source: String(frame.source || "lead"), label: String(frame.label || ""), text: "", media: [], asks: [] };
    live.streams[key] = entry;
    live.order.push(key);
  }
  if (frame.label && !entry.label) entry.label = String(frame.label);
  return entry;
}

/** One frame of the current turn → the next Live (copy-on-write, frames in seq order). */
function apply(live: Live, frame: Frame): Live {
  const seq = Number(frame.seq || 0);
  if (seq && seq <= live.seq) return live;
  const next: Live = { ...live, seq: seq || live.seq, streams: { ...live.streams }, order: [...live.order] };
  const key = String(frame.key || "lead");
  if (next.streams[key]) next.streams[key] = { ...next.streams[key] };
  switch (frame.type) {
    case "snapshot": {
      next.streams = {};
      next.order = [];
      const raw = (frame.streams || {}) as Record<string, Partial<Stream>>;
      for (const [k, v] of Object.entries(raw)) {
        next.streams[k] = { key: k, source: v.source || "lead", label: v.label || "", text: v.text || "", media: v.media || [], asks: v.asks || [] };
        next.order.push(k);
      }
      break;
    }
    case "start":
      stream(next, frame);
      next.queued = undefined;
      break;
    case "delta": {
      const s = stream(next, frame);
      s.text += String(frame.text || "");
      s.thinking = undefined;
      next.tool = undefined;
      break;
    }
    case "thinking":
      stream(next, frame).thinking = String(frame.text || "");
      break;
    case "tool":
      next.tool = frame.state === "running" ? String(frame.detail || frame.name || "") : undefined;
      break;
    case "media": {
      const s = stream(next, frame);
      const item = { url: String(frame.url || ""), mime: frame.mime ? String(frame.mime) : undefined };
      if (item.url && !s.media.some(m => m.url === item.url)) s.media = [...s.media, item];
      break;
    }
    case "ask": {
      const s = stream(next, frame);
      s.asks = [...s.asks, { id: String(frame.id || ""), questions: askQuestions(frame as Ask) }];
      break;
    }
    case "end":
      stream(next, frame).ended = true;
      break;
    case "startup":
      if (frame.stage === "queued") next.queued = Number(frame.ahead || 0) + 1;
      break;
    case "error":
      next.error = String(frame.message || "出错了");
      break;
    case "result":
    case "idle":
      next.done = true;
      next.tool = undefined;
      break;
  }
  return next;
}

export function useSeriesChat(api: SeriesApi, socketPath: string, sessionId: string, onPageFrame: (frame: Frame) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLiveState] = useState<Live | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [conn, setConn] = useState<ConnectionState>({ kind: "connecting", attempt: 1 });
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const liveRef = useRef<Live | null>(null);
  const socketRef = useRef<SeriesSocket | null>(null);
  const pageFrame = useRef(onPageFrame);
  pageFrame.current = onPageFrame;

  const setLive = useCallback((value: Live | null) => {
    liveRef.current = value;
    setLiveState(value);
  }, []);

  const reload = useCallback(async () => {
    const h = await api.history(sessionId);
    setMessages(h.messages);
    setLoaded(true);
    return h;
  }, [api, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    setMessages([]); setLive(null); setPending([]); setError(""); setLoaded(false);
    const finish = () => {
      reload().then(() => { if (alive && liveRef.current?.done) setLive(null); })
        .catch(e => { if (alive) setError(apiErrorMessage(e, "加载聊天记录失败")); });
    };
    const socket = new SeriesSocket(`${socketPath}?session=${encodeURIComponent(sessionId)}`, {
      onState: state => { if (alive) setConn(state); },
      onFrame: frame => {
        if (!alive) return;
        if (frame.type === "ready") {
          reload().then(() => {
            if (!alive) return;
            const replyTo = String(frame.reply_to || "");
            if (!frame.live) { setLive(null); return; }
            const current = liveRef.current;
            const same = current && current.replyTo === replyTo;
            if (!same) setLive(newLive(replyTo));
            socket.subscribe(same ? current.seq : 0);
          }).catch(e => { if (alive) setError(apiErrorMessage(e, "加载聊天记录失败")); });
          return;
        }
        if (frame.type === "accepted") {
          const message = frame.message as Message;
          setPending(list => list.filter(p => p.clientMessageId !== frame.client_message_id));
          setMessages(list => list.some(m => m.id === message.id) ? list : [...list, message]);
          setLive(newLive(message.id));
          return;
        }
        if (PAGE_FRAMES.has(frame.type)) pageFrame.current(frame);
        if (frame.seq == null) {
          // Not part of a turn: busy / bad_request for a prompt, or "nothing live" for subscribe / cancel.
          if (frame.type === "error") {
            setError(String(frame.message || "出错了"));
            if (frame.client_message_id) setPending(list => list.filter(p => p.clientMessageId !== frame.client_message_id));
          } else if (frame.type === "idle") {
            finish();
          }
          return;
        }
        const current = liveRef.current;
        if (!current) return;
        const next = apply(current, frame);
        if (next !== current) setLive(next);
        if (frame.type === "result") finish();
      },
    });
    socketRef.current = socket;
    socket.connect();
    const wake = () => { if (document.visibilityState === "visible") socket.retry(); };
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", wake);
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [socketPath, sessionId, reload, setLive]);

  const busy = Boolean(live && !live.done) || pending.length > 0;

  const send = useCallback((text: string, refs: ChatRef[] = [], resendOf?: string): boolean => {
    const socket = socketRef.current;
    const body = text.trim();
    if (!socket || (!body && !resendOf)) return false;
    const clientMessageId = messageId();
    if (!socket.prompt({ text: body, refs, resend_of: resendOf, client_message_id: clientMessageId })) {
      setError("还没连上，稍等再发");
      return false;
    }
    setError("");
    setPending(list => [...list, { clientMessageId, text: body || "（重发）", refs }]);
    return true;
  }, []);

  const answer = useCallback((ask: Ask, answers: AskAnswer[]): boolean => {
    const socket = socketRef.current;
    const text = answerText(askQuestions(ask), answers);
    if (!socket || !ask.id || !text) return false;
    const clientMessageId = messageId();
    if (!socket.answer(ask.id, answers, clientMessageId)) {
      setError("还没连上，稍等再选");
      return false;
    }
    setError("");
    setPending(list => [...list, { clientMessageId, text, refs: [] }]);
    return true;
  }, []);

  const cancel = useCallback(() => { socketRef.current?.cancel(); }, []);
  const retry = useCallback(() => { socketRef.current?.retry(); }, []);

  return { messages, live, pending, conn, error, loaded, busy, send, answer, cancel, retry, clearError: () => setError("") };
}
