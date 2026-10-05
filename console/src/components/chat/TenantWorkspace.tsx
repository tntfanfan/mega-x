import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage, type Company, type DeptCatalogItem } from "../../lib/api";
import type { BuilderDraft, ChatMsg } from "../../lib/builderFixtures";
import { resolveDeptDisplay } from "../../lib/depts";
import { outputWorkspaceKey } from "../../lib/outputRefs";
import { loadTryChat, saveTryChat, mergeTryHistory, turnsToMessages, type TryChatSession, type TryHistoryTurn } from "../../lib/tryChatReply";
import { TryChatWs, type SendTryMessage } from "../../lib/tryChatWs";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { workspaceStartupReason, type WorkspaceStartupProgress } from "../../lib/workspaceStartup";
import { TestWorkspace } from "../dev/TestWorkspace";
import { WorkspaceAvailabilityGate } from "../ui/WorkspaceAvailabilityGate";

const Context = createContext<ReturnType<typeof useTenantChat> | null>(null);

function useTenantChat(scope: WorkspaceScope, tenant: Company) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [selection, setSelection] = useState({ dept: params.get("dept") || "", session: params.get("session") || "" });
  useEffect(() => { if (params.has("dept")) setSelection({ dept: params.get("dept") || "", session: params.get("session") || "" }); }, [params.get("dept"), params.get("session")]);
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [userId, setUserId] = useState("");
  const [sessions, setSessions] = useState<TryChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState("");
  const [connectedIdentity, setConnectedIdentity] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [deptsLoaded, setDeptsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [progress, setProgress] = useState<WorkspaceStartupProgress | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const client = useRef<TryChatWs | null>(null);
  const currentMessages = useRef(messages);
  currentMessages.current = messages;
  const deptId = depts.some(d => d.id === (params.get("dept") || selection.dept)) ? (params.get("dept") || selection.dept) : depts[0]?.id || "";
  const sessionId = params.has("dept") ? params.get("session") || "" : selection.session;
  const identity = `${scope.base}:${deptId}:${sessionId}`;
  const ready = connectedIdentity === identity && loaded === identity && tenant.state === "running" && client.current?.ready === true;
  const workspaceKey = userId && deptId ? `${outputWorkspaceKey(userId, scope)}:dept:${deptId}:session:${sessionId || "default"}` : "";
  const label = resolveDeptDisplay(deptId, depts);
  const query = `dept_id=${encodeURIComponent(deptId)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
  useEffect(() => {
    let alive = true;
    api.get<{ user: { id: string } }>("/v1/me").then(r => { if (alive) setUserId(r.user.id); }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载用户失败")); });
    return () => { alive = false; };
  }, [retryAttempt]);
  useEffect(() => {
    let alive = true;
    setDeptsLoaded(false);
    api.get<{ items: DeptCatalogItem[] }>(`${scope.base}/depts`).then(r => { if (alive) setDepts(r.items || []); }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载部门失败")); })
      .finally(() => { if (alive) setDeptsLoaded(true); });
    return () => { alive = false; };
  }, [scope.base, tenant.dept_ids.join(","), retryAttempt]);
  useEffect(() => {
    if (!workspaceKey) return;
    let alive = true;
    setConnectedIdentity(""); setBusy(false); setLoaded(""); setConnectError(null); setProgress(null);
    setMessages(loadTryChat(workspaceKey)?.messages || []);
    api.get<{ items: TryHistoryTurn[] }>(`${scope.base}/chat?${query}`).then(r => {
      if (alive) setMessages(current => mergeTryHistory(current, turnsToMessages(r.items || [])));
    }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载聊天记录失败")); })
      .finally(() => { if (alive) setLoaded(identity); });
    return () => { alive = false; };
  }, [workspaceKey, identity, retryAttempt]);
  useEffect(() => {
    if (!deptId) return;
    let alive = true;
    api.get<{ sessions: TryChatSession[] }>(`${scope.base}/chat/sessions?dept_id=${encodeURIComponent(deptId)}`).then(r => { if (alive) setSessions(r.sessions); }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载会话失败")); });
    return () => { alive = false; };
  }, [scope.base, deptId, sessionId, busy]);
  useEffect(() => {
    if (workspaceKey && loaded === identity) saveTryChat(workspaceKey, { session_id: sessionId, messages });
  }, [workspaceKey, loaded, identity, sessionId, messages]);
  useEffect(() => {
    if (!workspaceKey || loaded !== identity || tenant.state !== "running") return;
    let disposed = false;
    const streams: Record<string, string> = {};
    const write = (key: string, source: "lead" | "sub", speaker: string, text = "", media?: string, mode: "append" | "replace" = "append") => {
      if (disposed) return;
      const id = streams[key] ||= `stream-${key}-${Date.now()}`;
      setBusy(true);
      setMessages(rows => {
        const existing = rows.find(m => m.id === id);
        if (!existing) return [...rows, { id, role: "copilot", text, source, label: speaker || label.name, media: media ? [media] : undefined }];
        return rows.map(m => m.id === id ? { ...m, text: mode === "replace" ? text : m.text + text, media: media ? [...new Set([...(m.media || []), media])] : m.media } : m);
      });
    };
    const ws = new TryChatWs(`${scope.base}/chat/ws?${query}`, {
      onProgress: value => { if (!disposed) { setProgress(value); setConnectedIdentity(""); } },
      onReady: () => {
        if (disposed) return;
        setConnectedIdentity(identity); setConnectError(null);
        for (const m of currentMessages.current) if (m.clientMessageId && ["sending", "delivery_unknown"].includes(m.status)) ws.requestStatus(m.clientMessageId);
        api.get<{ items: TryHistoryTurn[] }>(`${scope.base}/chat?${query}`).then(r => { if (!disposed) setMessages(rows => mergeTryHistory(rows, turnsToMessages(r.items))); }).catch(() => {});
      },
      onDelivery: info => {
        if (disposed) return;
        const status = info.status === "submitting" ? "delivery_unknown" : info.status;
        setMessages(rows => rows.map(m => m.clientMessageId === info.clientMessageId ? { ...m, status, ...(status === "accepted" ? { refs: info.refs } : {}) } : m));
        if (status === "failed") setBusy(false);
      },
      onStart: (key, source, speaker) => write(key, source, speaker),
      onDelta: (key, source, speaker, text) => write(key, source, speaker, text),
      onReplace: (key, source, speaker, text) => write(key, source, speaker, text, undefined, "replace"),
      onMedia: (key, source, speaker, url) => write(key, source, speaker, "", url),
      onTool: (_key, _source, speaker, name) => { if (!disposed) setToolStatus(speaker ? `${speaker} · ${name}` : name); },
      onEnd: key => { delete streams[key]; },
      onIdle: () => { if (!disposed) { setBusy(false); setToolStatus(null); } },
      onClose: () => { if (!disposed) { setConnectedIdentity(""); setMessages(rows => rows.map(m => m.status === "sending" ? { ...m, status: "delivery_unknown" } : m)); } },
      onError: (message, info) => {
        if (disposed) return;
        if (!ws.ready) setConnectedIdentity("");
        setConnectError(message); setBusy(false); setToolStatus(null);
        if (info?.clientMessageId) setMessages(rows => rows.map(m => m.clientMessageId === info.clientMessageId ? { ...m, status: info.code === "delivery_unknown" ? "delivery_unknown" : "failed" } : m));
      },
    });
    client.current = ws; ws.connect();
    return () => { disposed = true; ws.close(); if (client.current === ws) client.current = null; };
  }, [identity, workspaceKey, loaded, tenant.state, retryAttempt]);
  const onSend = (message: SendTryMessage) => {
    if (!ready || !client.current?.sendPrompt(message)) return false;
    setBusy(true); setConnectError(null);
    setMessages(rows => {
      const next: ChatMsg = { id: `try-user-${message.clientMessageId}`, role: "user", text: message.text, refs: message.refs, clientMessageId: message.clientMessageId, status: "sending" };
      return rows.some(m => m.clientMessageId === message.clientMessageId) ? rows.map(m => m.clientMessageId === message.clientMessageId ? next : m) : [...rows, next];
    });
    return true;
  };
  const onRecoverSubmission = (message: SendTryMessage) => {
    setMessages(rows => rows.some(m => m.clientMessageId === message.clientMessageId) ? rows : [...rows, { id: `try-user-${message.clientMessageId}`, role: "user", text: message.text, refs: message.refs, clientMessageId: message.clientMessageId, status: "delivery_unknown" }]);
    client.current?.requestStatus(message.clientMessageId);
  };
  const change = (dept: string, session?: string) => {
    if (busy) return;
    setSelection({ dept, session: session || "" });
    const next = new URLSearchParams(params); next.set("dept", dept);
    if (session) next.set("session", session); else next.delete("session");
    setParams(next);
  };
  const onSessionCreate = async () => {
    if (!ready || busy || creatingSession) return;
    setCreatingSession(true);
    try {
      const session = await api.post<TryChatSession>(`${scope.base}/chat/sessions?dept_id=${encodeURIComponent(deptId)}`, {});
      setSessions(rows => [session, ...rows]); change(deptId, session.session_id);
    } catch (e) { setConnectError(apiErrorMessage(e, "创建会话失败")); }
    finally { setCreatingSession(false); }
  };
  const draft = useMemo(() => ({ id: deptId, name: label.name, emoji: label.emoji } as BuilderDraft), [deptId, label.name, label.emoji]);
  return { scope, draft, workspaceKey, sessionId, sessions, messages, onSend, onRecoverSubmission,
    onCancel: () => client.current?.cancel(), busy, ready, connectError, toolStatus,
    tenantState: tenant.state, startup: tenant.startup, deptsLoaded, userLoaded: !!userId, progress,
    retry: () => { setConnectedIdentity(""); setConnectError(null); setRetryAttempt(value => value + 1); },
    creatingSession: creatingSession || busy, onSessionChange: (id: string) => change(deptId, id), onSessionCreate,
    onChatFocus: () => { const next = new URLSearchParams(params); next.set("dept", deptId); if (sessionId) next.set("session", sessionId); next.set("focus", "main"); navigate(`${scope.routeBase}/chat?${next}`); },
    depts, deptId, change, loaded: loaded === identity };
}

export function useTenantWorkspaceReady() {
  return useContext(Context)?.ready ?? false;
}

export function TenantChatProvider({ scope, tenant, children }: { scope: WorkspaceScope; tenant: Company; children: ReactNode }) {
  const chat = useTenantChat(scope, tenant);
  return <Context.Provider value={chat}>{children}</Context.Provider>;
}

export function TenantWorkspace({ panel }: { panel: "chat" | "tasks" }) {
  const chat = useContext(Context);
  if (!chat) throw new Error("TenantWorkspace requires TenantChatProvider");
  const noDepts = chat.deptsLoaded && !chat.depts.length && !chat.connectError;
  const failed = chat.tenantState === "error";
  const paused = chat.tenantState === "paused";
  const waiting = !failed && !paused && !noDepts;
  const reason = workspaceStartupReason(chat.tenantState === "provisioning" ? chat.startup?.step
    : !chat.userLoaded ? "loading_account" : !chat.deptsLoaded ? "loading_departments" : !chat.loaded ? "loading_history"
    : chat.progress?.stage || (chat.connectError ? "reconnecting" : "connecting"));
  const title = failed ? "初始化未成功" : paused ? "实例已暂停" : noDepts ? "请先添加部门"
    : reason.title;
  const detail = failed ? "聊天和任务暂时不可用，请重新初始化实例。" : paused ? "恢复实例后，聊天和任务会自动启用。"
    : noDepts ? "添加部门并完成初始化后，即可开始聊天和创建任务。"
    : reason.detail;
  const availability = { title, detail, waiting, attempt: chat.tenantState === "running" ? chat.progress?.attempt : undefined,
    onRetry: !noDepts && !paused ? chat.retry : undefined };
  return <div className="flex h-[calc(100dvh-8rem-72px)] min-h-0 min-w-0 flex-col">
    {chat.workspaceKey && chat.loaded ? <TestWorkspace key={chat.workspaceKey} {...chat} panel={panel}
      availability={availability}
      chatActions={<select aria-label="部门" value={chat.deptId} disabled={chat.busy} onChange={e => chat.change(e.target.value)} className="h-7 min-w-0 max-w-40 rounded border border-border-solid bg-surface px-2 text-xs text-body">
        {chat.depts.map(dept => <option key={dept.id} value={dept.id}>{resolveDeptDisplay(dept.id, chat.depts).label}</option>)}
      </select>} /> : <WorkspaceAvailabilityGate ready={false} {...availability}>
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-x divide-border-solid bg-bg lg:grid-cols-2">
        {[panel === "chat" ? "聊天" : "任务", "产出物"].map((label, i) => <div key={label} className={`flex flex-col ${i ? "hidden lg:flex" : ""}`}>
          <div className="h-10 border-b border-border-solid bg-surface/60 px-4 py-3 text-xs text-muted">{label}</div>
          <div className="flex-1 space-y-4 p-5"><div className="h-4 w-1/3 rounded bg-surface-2" /><div className="h-20 rounded-xl bg-surface" /><div className="h-12 w-2/3 rounded-xl bg-surface" /></div>
          {!i && <div className="m-4 h-20 rounded-2xl border border-border-solid bg-surface" />}
        </div>)}
      </div>
    </WorkspaceAvailabilityGate>}
  </div>;
}
