/**
 * Company chat WebSocket: OpenClaw lead + sub-agent tokens as they are
 * generated, instead of waiting for the whole `openclaw agent` process.
 *
 *   C→S: prompt | cancel | ping
 *   S→C: ready | accepted | start | delta | tool | media | end | idle | error | pong
 */

export type CompanyChatSource = "lead" | "sub";

export type CompanyChatPrompt = {
  message: string;
  dept_id: string;
  session_id?: string;
  label?: string;
  refs?: Array<Record<string, unknown>>;
};

export type CompanyChatWsHandlers = {
  onReady?: () => void;
  onAccepted?: (deptId: string, sessionId: string) => void;
  onStart?: (deptId: string, key: string, source: CompanyChatSource, label: string) => void;
  onDelta?: (deptId: string, key: string, source: CompanyChatSource, label: string, text: string) => void;
  onTool?: (deptId: string, key: string, name: string) => void;
  onMedia?: (deptId: string, key: string, url: string) => void;
  onEnd?: (deptId: string, key: string) => void;
  onIdle?: (deptId: string) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

function wsUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = path;
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

export class CompanyChatWs {
  private ws: WebSocket | null = null;
  private handlers: CompanyChatWsHandlers;
  private path: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  ready = false;
  busy = false;

  constructor(path: string, handlers: CompanyChatWsHandlers) {
    this.path = path;
    this.handlers = handlers;
  }

  connect(): void {
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws = new WebSocket(wsUrl(this.path));
    this.ws = ws;
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
      if (wasBusy) this.handlers.onIdle?.("");
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      }
    };
    ws.onerror = () => {
      this.ready = false;
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

  sendPrompt(prompt: CompanyChatPrompt): void {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handlers.onError?.("not connected");
      return;
    }
    this.busy = true;
    this.ws.send(JSON.stringify({ type: "prompt", ...prompt }));
  }

  cancel(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "cancel" }));
    }
    this.busy = false;
  }

  private dispatch(msg: Record<string, unknown>): void {
    const t = msg.type;
    const deptId = String(msg.dept_id ?? "");
    const key = String(msg.key ?? "");
    const source = (msg.source === "sub" ? "sub" : "lead") as CompanyChatSource;
    const label = String(msg.label ?? "");
    if (t === "ready") {
      this.ready = true;
      this.handlers.onReady?.();
      return;
    }
    if (t === "accepted") {
      this.busy = true;
      this.handlers.onAccepted?.(deptId, String(msg.session_id ?? ""));
      return;
    }
    if (t === "start" && key) {
      this.busy = true;
      this.handlers.onStart?.(deptId, key, source, label);
      return;
    }
    if (t === "delta" && key) {
      this.busy = true;
      this.handlers.onDelta?.(deptId, key, source, label, String(msg.text ?? ""));
      return;
    }
    if (t === "tool" && key) {
      this.busy = true;
      this.handlers.onTool?.(deptId, key, String(msg.name ?? ""));
      return;
    }
    if (t === "media" && key && typeof msg.url === "string") {
      this.handlers.onMedia?.(deptId, key, msg.url);
      return;
    }
    if (t === "end" && key) {
      this.handlers.onEnd?.(deptId, key);
      return;
    }
    if (t === "idle" || t === "pong") {
      if (t === "idle") {
        this.busy = false;
        this.handlers.onIdle?.(deptId);
      }
      return;
    }
    if (t === "error") {
      this.busy = false;
      this.handlers.onError?.(String(msg.message ?? "error"));
    }
  }
}
