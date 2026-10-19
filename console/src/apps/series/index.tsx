/**
 * 网剧部门应用：项目结构 │ 聊天 │ 当前产出物。
 *
 * 后端是租户里的 `platform/apps/series/`（HTTP / WS 都在 appBase 下）。聊天协议、
 * 断线重连、历史都是网剧自己的；产出物照旧写在 board/dept-series/series/，产出物
 * 中心也能看到。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoaderCircle, Plus, X } from "lucide-react";

import type { DeptAppProps } from "../registry";
import { apiErrorMessage } from "../../lib/api";
import { resolveDeptDisplay } from "../../lib/depts";
import { seriesApi, type ChatRef, type ProjectStatus, type ProjectSummary, type Session } from "./api";
import type { Frame } from "./socket";
import { useSeriesChat } from "./useChat";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { ChatPane } from "./components/ChatPane";
import { JobsBar } from "./components/JobsBar";
import { ProjectTree } from "./components/ProjectTree";

// Not "session": the shell's default chat (TenantChatProvider) reads ?session= on mount.
const SESSION_PARAM = "app_session";

export default function SeriesApp({ dept, appBase }: DeptAppProps) {
  const api = useMemo(() => seriesApi(appBase), [appBase]);
  const title = resolveDeptDisplay(dept.id, [dept]).name;
  const [params, setParams] = useSearchParams();
  const sid = params.get(SESSION_PARAM) || "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [selected, setSelected] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refs, setRefs] = useState<ChatRef[]>([]);
  const [error, setError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [publishedRef, setPublishedRef] = useState("");

  const openSession = useCallback((id: string) => {
    setParams(p => { const next = new URLSearchParams(p); next.set(SESSION_PARAM, id); return next; }, { replace: true });
  }, [setParams]);

  const loadSessions = useCallback(async () => {
    const list = await api.sessions();
    setSessions(list);
    return list;
  }, [api]);
  const loadProjects = useCallback(() => api.projects().then(setProjects).catch(e => setError(apiErrorMessage(e, "加载项目失败"))), [api]);
  const loadStatus = useCallback(async (pid: string) => {
    if (!pid) { setStatus(null); return; }
    try { setStatus(await api.status(pid)); } catch (e) { setStatus(null); setError(apiErrorMessage(e, "读取项目失败")); }
  }, [api]);

  // First visit: open the newest session, or start one.
  useEffect(() => {
    let alive = true;
    loadSessions().then(async list => {
      if (!alive || sid) return;
      const session = list[0] || await api.createSession();
      if (alive) openSession(session.id);
    }).catch(e => { if (alive) setError(apiErrorMessage(e, "加载会话失败")); });
    void loadProjects();
    return () => { alive = false; };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // The session's project.
  useEffect(() => {
    if (!sid) return;
    let alive = true;
    api.history(sid).then(h => { if (alive) setProjectId(h.project_id || ""); }).catch(() => undefined);
    return () => { alive = false; };
  }, [api, sid]);

  useEffect(() => { setSelected(""); setPublishedRef(""); void loadStatus(projectId); }, [projectId, loadStatus]);

  // Artifacts change underneath (the agent, another tab, a job finishing): SSE from the app.
  useEffect(() => {
    if (!projectId || typeof EventSource === "undefined") return;
    const source = new EventSource(api.eventsUrl(projectId), { withCredentials: true });
    source.addEventListener("change", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data && Array.isArray(data.items)) setStatus(data);
      } catch { /* ignore */ }
      setRefreshKey(k => k + 1);
    });
    return () => source.close();
  }, [api, projectId]);

  // After a publish, select what was just made (once the status shows it).
  useEffect(() => {
    if (!publishedRef || !status) return;
    const item = status.items.find(i => i.latest === publishedRef || i.canonical === publishedRef);
    if (item) { setSelected(item.logical); setPublishedRef(""); }
  }, [publishedRef, status]);

  const onPageFrame = useCallback((frame: Frame) => {
    const pid = String(frame.project_id || "");
    if (frame.type === "project" && (frame.action === "opened" || frame.action === "created") && pid) {
      setProjectId(pid);
      void loadProjects();
      void loadSessions().catch(() => undefined);
    }
    if (pid && pid === projectId) {
      void loadStatus(pid);
      setRefreshKey(k => k + 1);
    }
    if (frame.type === "artifact" && frame.action === "published" && pid === projectId) setPublishedRef(String(frame.ref || ""));
  }, [projectId, loadProjects, loadSessions, loadStatus]);

  const chat = useSeriesChat(api, `${appBase}/chat`, sid, onPageFrame);

  // Session list titles / busy flags follow the chat.
  useEffect(() => { if (sid) void loadSessions().catch(() => undefined); }, [sid, chat.busy, loadSessions]);

  const addRef = useCallback((ref: ChatRef) => {
    setRefs(list => list.some(r => r.ref === ref.ref) || list.length >= 8 ? list : [...list, ref]);
  }, []);

  const switchProject = async (pid: string) => {
    if (!sid || pid === projectId) return;
    try {
      await api.setProject(sid, pid);
      setProjectId(pid);
      setRefs([]);
      void loadSessions();
    } catch (e) {
      setError(apiErrorMessage(e, "切换项目失败"));
    }
  };

  const newSession = async () => {
    try {
      const session = await api.createSession(projectId ? { project_id: projectId } : {});
      await loadSessions();
      openSession(session.id);
    } catch (e) {
      setError(apiErrorMessage(e, "新建会话失败"));
    }
  };

  const select = (logical: string) => { setSelected(logical); setPanelOpen(true); };

  if (!sid) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">
      {error || <><LoaderCircle size={16} aria-hidden className="me-2 animate-spin" />打开会话…</>}
    </div>;
  }

  const panel = (
    <ArtifactPanel api={api} projectId={projectId} logical={selected} refreshKey={refreshKey} busy={chat.busy}
      onSend={(text, r) => chat.send(text, r)} onRef={addRef} onChanged={() => { void loadStatus(projectId); setRefreshKey(k => k + 1); }} />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border-solid bg-surface/60 px-3 py-2 text-sm">
        <label className="sr-only" htmlFor="series-project">项目</label>
        <select id="series-project" value={projectId} disabled={chat.busy} onChange={e => void switchProject(e.target.value)}
          title={chat.busy ? "正在回复，等这一轮结束再切换项目" : "切换项目"}
          className="max-w-[12rem] rounded-md border border-border-solid bg-surface px-2 py-1 text-sm text-heading disabled:opacity-60">
          {!projectId && <option value="">（还没选项目）</option>}
          {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.title}</option>)}
          {projectId && !projects.some(p => p.project_id === projectId) && <option value={projectId}>{projectId}</option>}
        </select>
        <span className="text-muted">│</span>
        <label className="sr-only" htmlFor="series-session">会话</label>
        <select id="series-session" value={sid} onChange={e => openSession(e.target.value)}
          className="max-w-[14rem] rounded-md border border-border-solid bg-surface px-2 py-1 text-sm text-body">
          {sessions.map(s => <option key={s.id} value={s.id}>{s.busy ? "● " : ""}{s.title}</option>)}
          {!sessions.some(s => s.id === sid) && <option value={sid}>新对话</option>}
        </select>
        <button type="button" onClick={() => void newSession()} title="新对话"
          className="inline-flex items-center gap-1 rounded-md border border-border-solid px-2 py-1 text-xs text-body hover:border-primary hover:text-primary">
          <Plus size={12} aria-hidden />新对话
        </button>
        <div className="ms-auto"><JobsBar jobs={status?.jobs || []} /></div>
      </header>
      {error && (
        <div role="alert" className="flex items-center gap-2 border-b border-border-solid px-3 py-1.5 text-xs text-fusion">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="关闭"><X size={13} aria-hidden /></button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <aside aria-label="项目结构" className="hidden w-60 shrink-0 overflow-y-auto border-e border-border-solid bg-surface/40 md:block">
          <div className="border-b border-border-solid px-3 py-2 text-xs text-muted">项目结构{status ? ` · ${status.title}` : ""}</div>
          <ProjectTree status={status} selected={selected} onSelect={select} onRef={addRef} />
        </aside>
        <ChatPane title={title} messages={chat.messages} live={chat.live} pending={chat.pending} conn={chat.conn}
          error={chat.error} busy={chat.busy} refs={refs} setRefs={setRefs} mediaSrc={api.mediaSrc}
          onSend={chat.send} onAnswer={chat.answer} onCancel={chat.cancel} onRetry={chat.retry} onClearError={chat.clearError} />
        <aside aria-label="当前产出物" className="hidden w-[26rem] shrink-0 overflow-y-auto border-s border-border-solid bg-surface/40 xl:block">
          <div className="border-b border-border-solid px-3 py-2 text-xs text-muted">当前产出物</div>
          {panel}
        </aside>
        {panelOpen && selected && (
          <aside aria-label="当前产出物" className="absolute inset-y-0 end-0 z-20 w-full max-w-md overflow-y-auto border-s border-border-solid bg-bg shadow-xl xl:hidden">
            <div className="flex items-center border-b border-border-solid px-3 py-2 text-xs text-muted">
              <span className="flex-1">当前产出物</span>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="关闭"><X size={14} aria-hidden /></button>
            </div>
            {panel}
          </aside>
        )}
      </div>
    </div>
  );
}
