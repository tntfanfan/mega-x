import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage, type Company, type DeptCatalogItem } from "../../lib/api";
import type { BuilderDraft, ChatMsg } from "../../lib/builderFixtures";
import { resolveDeptDisplay } from "../../lib/depts";
import { outputWorkspaceKey } from "../../lib/outputRefs";
import { loadTryChat, saveTryChat, mergeTryHistory, turnsToMessages, type TryChatSession, type TryHistoryTurn } from "../../lib/tryChatReply";
import { TryChatWs, type SendTryMessage } from "../../lib/tryChatWs";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { TestWorkspace } from "../dev/TestWorkspace";

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
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const client = useRef<TryChatWs | null>(null);
  const currentMessages = useRef(messages);
  currentMessages.current = messages;
  const deptId = depts.some(d => d.id === (params.get("dept") || selection.dept)) ? (params.get("dept") || selection.dept) : depts[0]?.id || "";
  const sessionId = params.has("dept") ? params.get("session") || "" : selection.session;
  const identity = `${scope.base}:${deptId}:${sessionId}`;
  const workspaceKey = userId && deptId ? `${outputWorkspaceKey(userId, scope)}:dept:${deptId}:session:${sessionId || "default"}` : "";
  const label = resolveDeptDisplay(deptId, depts);
  const query = `dept_id=${encodeURIComponent(deptId)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
  useEffect(() => {
    let alive = true;
    api.get<{ user: { id: string } }>("/v1/me").then(r => { if (alive) setUserId(r.user.id); }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载用户失败")); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    api.get<{ items: DeptCatalogItem[] }>(`${scope.base}/depts`).then(r => { if (alive) setDepts(r.items || []); }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载部门失败")); });
    return () => { alive = false; };
  }, [scope.base, tenant.dept_ids.join(",")]);
  useEffect(() => {
    if (!workspaceKey) return;
    let alive = true;
    setReady(false); setBusy(false); setLoaded(""); setConnectError(null);
    setMessages(loadTryChat(workspaceKey)?.messages || []);
    api.get<{ items: TryHistoryTurn[] }>(`${scope.base}/chat?${query}`).then(r => {
      if (alive) setMessages(current => mergeTryHistory(current, turnsToMessages(r.items || [])));
    }).catch(e => { if (alive) setConnectError(apiErrorMessage(e, "加载聊天记录失败")); })
      .finally(() => { if (alive) setLoaded(identity); });
    return () => { alive = false; };
  }, [workspaceKey, identity]);
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
    const write = (key: string, source: "lead" | "sub", speaker: string, text = "", media?: string) => {
      if (disposed) return;
      const id = streams[key] ||= `stream-${key}-${Date.now()}`;
      setBusy(true);
      setMessages(rows => {
        const existing = rows.find(m => m.id === id);
        if (!existing) return [...rows, { id, role: "copilot", text, source, label: speaker || label.name, media: media ? [media] : undefined }];
        return rows.map(m => m.id === id ? { ...m, text: m.text + text, media: media ? [...new Set([...(m.media || []), media])] : m.media } : m);
      });
    };
    const ws = new TryChatWs(`${scope.base}/chat/ws?${query}`, {
      onReady: () => {
        if (disposed) return;
        setReady(true); setConnectError(null);
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
      onMedia: (key, source, speaker, url) => write(key, source, speaker, "", url),
      onTool: (_key, _source, speaker, name) => { if (!disposed) setToolStatus(speaker ? `${speaker} · ${name}` : name); },
      onEnd: key => { delete streams[key]; },
      onIdle: () => { if (!disposed) { setBusy(false); setToolStatus(null); } },
      onClose: () => { if (!disposed) { setReady(false); setMessages(rows => rows.map(m => m.status === "sending" ? { ...m, status: "delivery_unknown" } : m)); } },
      onError: (message, info) => {
        if (disposed) return;
        setConnectError(message); setBusy(false); setToolStatus(null);
        if (info?.clientMessageId) setMessages(rows => rows.map(m => m.clientMessageId === info.clientMessageId ? { ...m, status: info.code === "delivery_unknown" ? "delivery_unknown" : "failed" } : m));
      },
    });
    client.current = ws; ws.connect();
    return () => { disposed = true; ws.close(); if (client.current === ws) client.current = null; };
  }, [identity, workspaceKey, loaded, tenant.state]);
  const onSend = (message: SendTryMessage) => {
    if (!client.current?.sendPrompt(message)) return false;
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
    if (busy || creatingSession) return;
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
    creatingSession: creatingSession || busy, onSessionChange: (id: string) => change(deptId, id), onSessionCreate,
    onChatFocus: () => { const next = new URLSearchParams(params); next.set("dept", deptId); if (sessionId) next.set("session", sessionId); next.set("focus", "main"); navigate(`${scope.routeBase}/chat?${next}`); },
    depts, deptId, change, loaded: loaded === identity };
}

export function TenantChatProvider({ scope, tenant, children }: { scope: WorkspaceScope; tenant: Company; children: ReactNode }) {
  const chat = useTenantChat(scope, tenant);
  return <Context.Provider value={chat}>{children}</Context.Provider>;
}

export function TenantWorkspace({ panel }: { panel: "chat" | "tasks" }) {
  const chat = useContext(Context);
  if (!chat) throw new Error("TenantWorkspace requires TenantChatProvider");
  if (!chat.workspaceKey || !chat.loaded) return <p className="p-5 text-sm text-muted">{chat.connectError || (chat.depts.length ? "加载中…" : "请先添加部门")}</p>;
  return <div className="flex h-[calc(100dvh-8rem-72px)] min-h-0 min-w-0 flex-col">
    <TestWorkspace key={chat.workspaceKey} {...chat} panel={panel}
      chatActions={<select aria-label="部门" value={chat.deptId} disabled={chat.busy} onChange={e => chat.change(e.target.value)} className="h-7 min-w-0 max-w-40 rounded border border-border-solid bg-surface px-2 text-xs text-body">
        {chat.depts.map(dept => <option key={dept.id} value={dept.id}>{resolveDeptDisplay(dept.id, chat.depts).label}</option>)}
      </select>} />
  </div>;
}
