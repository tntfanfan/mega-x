/**
 * Recruiter WebSocket client for Builder Studio.
 *
 * Protocol (subset of rh_vc_cc + draft_update):
 *   C→S: init | prompt | cancel | new_session | ping
 *   S→C: ready | claude_event | session_info | draft_update |
 *         history_start | history_user | history_end | done | error | pong
 */

export type RecruiterWsHandlers = {
  onReady?: (info: { draft_id: string; cwd: string; user_id: string }) => void;
  onSessionInfo?: (sessionId: string | null) => void;
  onUserText?: (text: string) => void;
  onAssistantDelta?: (text: string) => void;
  onAssistantReset?: () => void;
  onToolUse?: (name: string) => void;
  onDraftUpdate?: (draft: unknown) => void;
  onDone?: (exitCode: number | null) => void;
  onError?: (message: string) => void;
  onStatus?: (text: string) => void;
};

function wsUrl(): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/v1/dev/recruiter/ws";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  // Same-origin (vite proxy or mega-x / nginx)
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/v1/dev/recruiter/ws`;
}

export class RecruiterWs {
  private ws: WebSocket | null = null;
  private handlers: RecruiterWsHandlers;
  private userId: string;
  private draftId: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private streaming = false;
  busy = false;

  constructor(userId: string, draftId: string, handlers: RecruiterWsHandlers) {
    this.userId = userId;
    this.draftId = draftId;
    this.handlers = handlers;
  }

  connect(replay = true): void {
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = wsUrl();
    this.handlers.onStatus?.(`connecting ${url}`);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.send({
        type: "init",
        user_id: this.userId,
        draft_id: this.draftId,
        replay,
      });
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
      this.busy = false;
      if (!this.intentionalClose) {
        this.handlers.onStatus?.("disconnected — reconnecting…");
        this.reconnectTimer = setTimeout(() => this.connect(false), 1500);
      }
    };
    ws.onerror = () => {
      this.handlers.onError?.("WebSocket error");
    };
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      // Detach handlers first: closing a still-CONNECTING socket fires
      // onerror/onclose, which would surface a toast and (before the Toast
      // context was memoized) re-trigger the owning effect in a loop.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
  }

  sendPrompt(text: string): void {
    if (this.busy) {
      this.handlers.onError?.("busy: wait for the current turn to finish");
      return;
    }
    this.busy = true;
    this.streaming = false;
    this.handlers.onAssistantReset?.();
    this.send({ type: "prompt", text });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  newSession(): void {
    this.send({ type: "new_session" });
  }

  private send(obj: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handlers.onError?.("not connected");
      return;
    }
    this.ws.send(JSON.stringify(obj));
  }

  private dispatch(msg: Record<string, unknown>): void {
    const t = msg.type;
    if (t === "ready") {
      this.handlers.onReady?.(msg as { draft_id: string; cwd: string; user_id: string });
      this.handlers.onStatus?.("ready");
      return;
    }
    if (t === "session_info") {
      this.handlers.onSessionInfo?.((msg.session_id as string | null) ?? null);
      return;
    }
    if (t === "history_user") {
      this.handlers.onUserText?.(String(msg.text ?? ""));
      return;
    }
    if (t === "history_start" || t === "history_end" || t === "run_status" || t === "pong") {
      return;
    }
    if (t === "draft_update") {
      this.handlers.onDraftUpdate?.(msg.draft);
      return;
    }
    if (t === "done") {
      this.busy = false;
      this.streaming = false;
      this.handlers.onDone?.((msg.exit_code as number | null) ?? null);
      return;
    }
    if (t === "error") {
      this.busy = false;
      this.handlers.onError?.(String(msg.message ?? "error"));
      return;
    }
    if (t === "claude_event") {
      this.handleClaudeEvent(msg.event as Record<string, unknown>);
    }
  }

  private handleClaudeEvent(event: Record<string, unknown>): void {
    if (!event || typeof event !== "object") return;
    const et = event.type;

    // Stream text deltas
    if (et === "stream_event") {
      const inner = event.event as Record<string, unknown> | undefined;
      if (!inner) return;
      if (inner.type === "content_block_delta") {
        const delta = inner.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          if (!this.streaming) {
            this.streaming = true;
            this.handlers.onAssistantReset?.();
          }
          this.handlers.onAssistantDelta?.(delta.text);
        }
      }
      return;
    }

    if (et === "assistant") {
      const content = (event.message as { content?: unknown[] } | undefined)?.content ?? [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type?: string; name?: string; text?: string };
        if (b.type === "tool_use" && b.name) {
          this.handlers.onToolUse?.(b.name);
        }
        // Full assistant text only if we didn't already stream deltas
        if (b.type === "text" && b.text && !this.streaming) {
          this.handlers.onAssistantDelta?.(b.text);
        }
      }
    }
  }
}
