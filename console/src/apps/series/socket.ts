/**
 * 网剧应用自己的聊天协议（`WS ${appBase}/chat?session=`，见 server.py）。
 *
 * 一轮对话归应用：浏览器断开不影响它。重连后服务端先发 `ready {live, seq,
 * reply_to}`，页面据此 `subscribe(after)` 补帧；缓冲已经丢掉的帧由服务端先给
 * `snapshot`。应用层心跳：每 20 秒 `ping`，45 秒收不到任何帧就断开重连，这样能
 * 分清是哪一层断的。
 *
 * 关闭码：1013 = 部门应用尚未启动（转发层给的），4404 = 无权或部门不是应用，
 * 4401 = 未登录。
 */

import type { AskAnswer, ChatRef } from "./api";

export type Frame = { type: string; seq?: number; [key: string]: unknown };

export type ConnectionState =
  | { kind: "connecting"; attempt: number }
  | { kind: "open" }
  | { kind: "unavailable"; attempt: number }
  | { kind: "reconnecting"; attempt: number; reason: string }
  | { kind: "fatal"; reason: string };

export type SocketHandlers = {
  onFrame: (frame: Frame) => void;
  onState: (state: ConnectionState) => void;
};

const PING_MS = 20_000;
const SILENCE_MS = 45_000;

function wsUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const u = new URL(path, base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`;
}

export function messageId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export class SeriesSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private path: string, private handlers: SocketHandlers) {}

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closed = false;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.attempt += 1;
    this.handlers.onState({ kind: "connecting", attempt: this.attempt });
    const ws = new WebSocket(wsUrl(this.path));
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.handlers.onState({ kind: "open" });
      this.pingTimer = setInterval(() => this.send({ op: "ping" }), PING_MS);
      this.heard();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.heard();
      let frame: Frame;
      try { frame = JSON.parse(String(ev.data)); } catch { return; }
      if (frame.type === "pong" || frame.type === "heartbeat") return;
      this.handlers.onFrame(frame);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.clearTimers();
      this.ws = null;
      if (this.closed) return;
      if (ev.code === 4404 || ev.code === 4401 || ev.code === 4400 || ev.code === 1008) {
        this.handlers.onState({ kind: "fatal", reason: ev.code === 4404 ? "没有权限使用这个部门应用" : ev.reason || "连接被拒绝" });
        return;
      }
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.attempt, 4));
      this.handlers.onState(ev.code === 1013
        ? { kind: "unavailable", attempt: this.attempt }
        : { kind: "reconnecting", attempt: this.attempt, reason: ev.reason || "连接断开" });
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }

  /** Reconnect now (the user pressed 重试, or the tab came back). */
  retry(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!this.ws) this.connect();
  }

  prompt(body: { text: string; refs?: ChatRef[]; resend_of?: string; client_message_id: string }): boolean {
    return this.send({ op: "prompt", ...body });
  }

  answer(askId: string, answers: AskAnswer[], clientMessageId: string): boolean {
    return this.send({ op: "answer", ask_id: askId, answers, client_message_id: clientMessageId });
  }

  subscribe(after: number): boolean {
    return this.send({ op: "subscribe", after });
  }

  cancel(): boolean {
    return this.send({ op: "cancel" });
  }

  private send(obj: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  private heard(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.ws?.close(4000, "服务没有响应"), SILENCE_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.pingTimer = this.silenceTimer = null;
  }
}
