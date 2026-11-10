/**
 * 游戏部的「聊天」：直接内嵌部署好的游戏前端（metal-max），玩家在游戏里自己注册 / 登录。
 *
 * - 地址来自 `VITE_GAME_URL`（如 `http://<HOST_IP>:7330`），为空就只显示「未配置」。
 * - 先探一次游戏前端（跨源，`no-cors`：有任何响应即视为已起来，连不上会抛 TypeError），
 *   没起来时和部门应用一样显示等待遮罩、每 5 秒自动重试；起来之后断线由游戏自己处理。
 * - 游戏画布固定 1920×960（Phaser 实际是 scale NONE），所以 iframe 也固定成这个尺寸，
 *   再按容器大小 `transform: scale(k)` 等比缩放；点击坐标由浏览器换算，游戏不用改。
 * - 跨源 iframe，与 console 无任何通信；不加 sandbox（游戏要 WebSocket / localStorage / 全屏）。
 * - 免登：`POST /v1/me/game-login` 取「mega-x 邮箱 + 平台派生的密码」，iframe 带 `?embed=megax`，
 *   游戏发 `lgh-game:ready` 时（以及 iframe onLoad 时）回 `lgh-game:login`，
 *   targetOrigin 钉死为游戏源，只有游戏能收到。游戏只认白名单里的父页面源
 *   （metal-max 的 `VITE_EMBED_PARENT_ORIGINS`）。取凭证失败就退回手动登录。
 * - 切走部门时 iframe 卸载、socket 断开，切回来会再自动登录一次。
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { WorkspaceAvailabilityGate } from "../../components/ui/WorkspaceAvailabilityGate";
import { api } from "../../lib/api";

const GAME_W = 1920;
const GAME_H = 960;
const RETRY_MS = 5000;
const PROBE_TIMEOUT_MS = 4000;

const GAME_URL = ((import.meta.env.VITE_GAME_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");

const GAME_ORIGIN = (() => { try { return GAME_URL ? new URL(GAME_URL).origin : ""; } catch { return ""; } })();

type Probe = "checking" | "up" | "down";
type GameLogin = { email: string; password: string };

/** Cross-origin reachability check: an opaque response means the server answered. */
async function probeGame(signal: AbortSignal): Promise<boolean> {
  try {
    await fetch(`${GAME_URL}/`, { mode: "no-cors", cache: "no-store", signal });
    return true;
  } catch {
    return false;
  }
}

export function GameChatPanel() {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [probe, setProbe] = useState<Probe>("checking");
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const login = useRef<GameLogin | null>(null);

  const sendLogin = () => {
    const c = login.current;
    const win = frame.current?.contentWindow;
    if (!c || !win || !GAME_ORIGIN) return;
    win.postMessage({ type: "lgh-game:login", email: c.email, password: c.password }, GAME_ORIGIN);
  };

  useEffect(() => {
    if (!GAME_ORIGIN) return;
    let alive = true;
    api.post<GameLogin>("/v1/me/game-login")
      .then(c => { if (alive && c?.email && c?.password) { login.current = c; sendLogin(); } })
      .catch(() => { /* 取不到就手动登录 */ });
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== GAME_ORIGIN || ev.source !== frame.current?.contentWindow) return;
      if ((ev.data as { type?: unknown } | null)?.type === "lgh-game:ready") sendLogin();
    };
    window.addEventListener("message", onMessage);
    return () => { alive = false; window.removeEventListener("message", onMessage); };
  }, []);

  useEffect(() => {
    if (!GAME_URL) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    void probeGame(ctrl.signal).then(ok => {
      clearTimeout(timeout);
      if (!alive) return;
      setProbe(ok ? "up" : "down");
      if (!ok) retry = setTimeout(() => setAttempt(n => n + 1), RETRY_MS);
    });
    return () => { alive = false; ctrl.abort(); clearTimeout(timeout); if (retry) clearTimeout(retry); };
  }, [attempt]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setK(Math.min(width / GAME_W, height / GAME_H));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [probe]);

  if (!GAME_URL) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceAvailabilityGate ready={false} waiting={false} title="游戏服未配置"
          detail="console 没有拿到 VITE_GAME_URL，请在部署配置里设置游戏前端地址后重建 console 容器。">
          <div className="flex-1" />
        </WorkspaceAvailabilityGate>
      </div>
    );
  }

  if (probe !== "up") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceAvailabilityGate ready={false}
          title={probe === "checking" ? "正在连接游戏服" : "游戏服尚未启动 / 正在重启"}
          detail={probe === "checking" ? "正在检查游戏服。" : `${GAME_URL} 还连不上，几秒后自动重试。`}
          attempt={attempt + 1} onRetry={probe === "down" ? () => setAttempt(n => n + 1) : undefined}>
          <div className="flex-1" />
        </WorkspaceAvailabilityGate>
      </div>
    );
  }

  const fullscreen = () => { void box.current?.requestFullscreen?.().catch(() => {}); };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border-solid bg-surface/60 px-2 py-1 text-xs">
        <button type="button" onClick={fullscreen}
          className="rounded-md px-2 py-0.5 text-body hover:bg-surface-2 hover:text-heading">全屏</button>
        <button type="button" onClick={() => setReloadKey(n => n + 1)}
          className="rounded-md px-2 py-0.5 text-body hover:bg-surface-2 hover:text-heading">重新加载</button>
        <a href={`${GAME_URL}/`} target="_blank" rel="noopener"
          className="rounded-md px-2 py-0.5 text-body hover:bg-surface-2 hover:text-heading">新窗口打开</a>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <iframe ref={frame} key={reloadKey} src={`${GAME_URL}/?embed=megax`} title="游戏" onLoad={sendLogin}
          allow="fullscreen; autoplay" allowFullScreen width={GAME_W} height={GAME_H}
          className="absolute left-1/2 top-1/2 max-w-none border-0"
          style={{ transform: `translate(-50%, -50%) scale(${k})`, visibility: k > 0 ? "visible" : "hidden" }} />
      </div>
    </div>
  );
}
