/**
 * Studio try-run WebSocket: live tokens from the department lead and
 * every OpenClaw sub-agent.
 *
 *   C→S: prompt | request_status | cancel | ping
 *   S→C: ready | accepted | delivery_status | start | delta | replace | tool | end | idle | error | pong
 */

export type TryChatSource = "lead" | "sub";
import { normalizeRefs, refsForApi, type ChatRef } from "./chatRefs";
import { messageId } from "./outputRefs";

export type SendTryMessage = { clientMessageId: string; text: string; refs: ChatRef[]; retry?: boolean };
export type TryDelivery = { clientMessageId: string; turnId?: string; refs: ChatRef[];
  status: "accepted" | "failed" | "delivery_unknown" | "submitting"; code?: string };

export type TryChatWsHandlers = {
  onReady?: (info: { session_id: string; agent: string; capabilities?: { output_refs?: boolean } }) => void;
  onDelivery?: (info: TryDelivery) => void;
  onStart?: (key: string, source: TryChatSource, label: string) => void;
  onDelta?: (key: string, source: TryChatSource, label: string, text: string) => void;
  onReplace?: (key: string, source: TryChatSource, label: string, text: string) => void;
  onMedia?: (key: string, source: TryChatSource, label: string, url: string) => void;
  onTool?: (key: string, source: TryChatSource, label: string, name: string) => void;
  onEnd?: (key: string) => void;
  onIdle?: () => void;
  onError?: (message: string, info?: { clientMessageId?: string; code?: string; path?: string }) => void;
  onStatus?: (text: string) => void;
  onClose?: () => void;
};

function wsUrl(wsPath: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(wsPath, base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.hash = "";
    return u.toString();
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${wsPath}`;
}

export class TryChatWs {
  private ws: WebSocket | null = null;
  private handlers: TryChatWsHandlers;
  private wsPath: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private lastError = "";
  private lastErrorAt = 0;
  ready = false;
  busy = false;
  supportsOutputRefs = false;

  constructor(wsPath: string, handlers: TryChatWsHandlers) {
    this.wsPath = wsPath;
    this.handlers = handlers;
  }

  connect(): void {
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = wsUrl(this.wsPath);
    this.handlers.onStatus?.(`connecting ${url}`);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.handlers.onStatus?.("connected");
    };
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.dispatch(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.ready = false;
      const wasBusy = this.busy;
      this.busy = false;
      this.handlers.onClose?.();
      if (wasBusy) this.handlers.onIdle?.();
      if (!this.intentionalClose) {
        this.handlers.onStatus?.("disconnected — reconnecting…");
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      }
    };
    ws.onerror = () => {
      this.handlers.onStatus?.("WebSocket error");
    };
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.ready = false;
    this.busy = false;
    this.supportsOutputRefs = false;
  }

  sendPrompt(value: string | SendTryMessage): boolean {
    const payload = typeof value === "string" ? { text: value, refs: [], clientMessageId: messageId() } : value;
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    if (payload.refs.length && !this.supportsOutputRefs) {
      this.handlers.onError?.("当前环境尚不支持产出物引用", { clientMessageId: payload.clientMessageId, code: "unsupported_refs" });
      return false;
    }
    if (this.busy) {
      this.handlers.onError?.("busy: wait for the current turn to finish");
      return false;
    }
    this.busy = true;
    return this.send({ type: "prompt", message: payload.text, refs: refsForApi(payload.refs),
      client_message_id: payload.clientMessageId, ...(payload.retry ? { retry: true } : {}) });
  }

  requestStatus(clientMessageId: string): void { this.send({ type: "request_status", client_message_id: clientMessageId }); }

  cancel(): void {
    this.send({ type: "cancel" });
    this.busy = false;
  }

  private send(obj: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.busy = false;
      this.handlers.onError?.("not connected", { clientMessageId: obj.client_message_id as string | undefined });
      return false;
    }
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch {
      this.busy = false;
      this.handlers.onError?.("not connected", { clientMessageId: obj.client_message_id as string | undefined });
      return false;
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    const t = msg.type;
    const key = String(msg.key ?? "");
    const source = (msg.source === "sub" ? "sub" : "lead") as TryChatSource;
    const label = String(msg.label ?? "");
    if (t === "ready") {
      this.ready = true;
      this.supportsOutputRefs = !!(msg.capabilities as { output_refs?: boolean } | undefined)?.output_refs;
      this.handlers.onReady?.({
        session_id: String(msg.session_id ?? ""),
        agent: String(msg.agent ?? ""),
        capabilities: msg.capabilities as { output_refs?: boolean } | undefined,
      });
      return;
    }
    if (t === "accepted" || t === "delivery_status") {
      const status = t === "accepted" ? "accepted" : String(msg.status || "delivery_unknown");
      if (status === "failed") this.busy = false;
      this.handlers.onDelivery?.({ clientMessageId: String(msg.client_message_id || ""), turnId: msg.turn_id as string | undefined,
        refs: normalizeRefs(msg.refs) || [], status: status as TryDelivery["status"], code: msg.code as string | undefined });
      return;
    }
    if (t === "start" && key) {
      this.busy = true;
      this.handlers.onStart?.(key, source, label);
      return;
    }
    if ((t === "delta" || t === "replace") && key) {
      this.busy = true;
      const text = String(msg.text ?? "");
      if (t === "replace") this.handlers.onReplace?.(key, source, label, text);
      else this.handlers.onDelta?.(key, source, label, text);
      return;
    }
    if (t === "media" && key && typeof msg.url === "string") {
      this.busy = true;
      this.handlers.onMedia?.(key, source, label, msg.url);
      return;
    }
    if (t === "tool" && key) {
      this.busy = true;
      this.handlers.onTool?.(key, source, label, String(msg.name ?? ""));
      return;
    }
    if (t === "end" && key) {
      this.handlers.onEnd?.(key);
      return;
    }
    if (t === "idle" || t === "pong") {
      if (t === "idle") {
        this.busy = false;
        this.handlers.onIdle?.();
      }
      return;
    }
    if (t === "error") {
      this.busy = false;
      const message = String(msg.message ?? "error");
      const now = Date.now();
      if (!msg.client_message_id && message === this.lastError && now - this.lastErrorAt < 8000) return;
      this.lastError = message;
      this.lastErrorAt = now;
      this.handlers.onError?.(message, { clientMessageId: msg.client_message_id as string | undefined,
        code: msg.code as string | undefined, path: msg.path as string | undefined });
    }
  }
}
