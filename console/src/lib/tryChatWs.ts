/**
 * Studio try-run WebSocket: live tokens from the department lead and
 * every OpenClaw sub-agent.
 *
 *   C→S: prompt | cancel | ping
 *   S→C: ready | start | delta | tool | end | idle | error | pong
 */

export type TryChatSource = "lead" | "sub";

export type TryChatWsHandlers = {
  onReady?: (info: { session_id: string; agent: string }) => void;
  onStart?: (key: string, source: TryChatSource, label: string) => void;
  onDelta?: (key: string, source: TryChatSource, label: string, text: string) => void;
  onTool?: (key: string, source: TryChatSource, label: string, name: string) => void;
  onEnd?: (key: string) => void;
  onIdle?: () => void;
  onError?: (message: string) => void;
  onStatus?: (text: string) => void;
  onClose?: () => void;
};

function wsUrl(wsPath: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = wsPath;
    u.search = "";
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
  }

  sendPrompt(text: string): void {
    if (this.busy) {
      this.handlers.onError?.("busy: wait for the current turn to finish");
      return;
    }
    this.busy = true;
    this.send({ type: "prompt", message: text });
  }

  cancel(): void {
    this.send({ type: "cancel" });
    this.busy = false;
  }

  private send(obj: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.busy = false;
      this.handlers.onError?.("not connected");
      return;
    }
    this.ws.send(JSON.stringify(obj));
  }

  private dispatch(msg: Record<string, unknown>): void {
    const t = msg.type;
    const key = String(msg.key ?? "");
    const source = (msg.source === "sub" ? "sub" : "lead") as TryChatSource;
    const label = String(msg.label ?? "");
    if (t === "ready") {
      this.ready = true;
      this.handlers.onReady?.({
        session_id: String(msg.session_id ?? ""),
        agent: String(msg.agent ?? ""),
      });
      return;
    }
    if (t === "start" && key) {
      this.busy = true;
      this.handlers.onStart?.(key, source, label);
      return;
    }
    if (t === "delta" && key) {
      this.busy = true;
      this.handlers.onDelta?.(key, source, label, String(msg.text ?? ""));
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
      if (message === this.lastError && now - this.lastErrorAt < 8000) return;
      this.lastError = message;
      this.lastErrorAt = now;
      this.handlers.onError?.(message);
    }
  }
}
