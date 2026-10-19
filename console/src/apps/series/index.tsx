/**
 * 网剧部门应用：对话 │ 产出物工作区（按环节分栏）。
 *
 * 对话是唯一的入口：想做什么都跟主创说；右边按环节（设定 / 剧本 / 资产 / 分镜 / 视频 / 成片 / 审查）
 * 摆着每样产出物和它的各个版本，用户在这里看、改文字、对比、选哪一版定稿（最终使用），
 * 任何一样都能拖回对话里接着问。右边也能切到「文件」，看项目目录在磁盘上的原样。
 *
 * 后端是租户里的 `platform/apps/series/`（HTTP / WS 都在 appBase 下）。聊天协议、
 * 断线重连、历史都是网剧自己的；产出物照旧写在 board/dept-series/series/，产出物
 * 中心也能看到。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, FolderOpen, LayoutGrid, LoaderCircle, PanelRightClose, PanelRightOpen, Plus, X } from "lucide-react";

import type { DeptAppProps } from "../registry";
import { apiErrorMessage } from "../../lib/api";
import { resolveDeptDisplay } from "../../lib/depts";
import { logicalOf, seriesApi, type ChatRef, type ProjectStatus, type ProjectSummary, type Session } from "./api";
import { projectPath } from "./files";
import type { Frame } from "./socket";
import { useSeriesChat } from "./useChat";
import { itemRef, refLabel, stageOf, timeLabel, type StageId, type TabId } from "./stages";
import { ChatPane, REF_LIMIT, type Draft } from "./components/ChatPane";
import { JobsBar } from "./components/JobsBar";
import { SessionPicker } from "./components/SessionPicker";
import { Popover } from "./components/bits";
import { Workspace, type SeriesView } from "./components/Workspace";

// Not "session": the shell's default chat (TenantChatProvider) reads ?session= on mount.
const SESSION_PARAM = "app_session";
const LAYOUT_KEY = "series.layout";
const VIEW_KEY = "series.view";
const CHAT_MIN = 340;
const WORK_MIN = 420;

type Layout = { chat: number; workspace: boolean };

function readLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return { chat: Number(raw.chat) || 460, workspace: raw.workspace !== false };
  } catch {
    return { chat: 460, workspace: true };
  }
}

function saveLayout(layout: Layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* private mode */ }
}

function readView(): SeriesView {
  try { return localStorage.getItem(VIEW_KEY) === "files" ? "files" : "structured"; } catch { return "structured"; }
}

function useWide(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function SeriesApp({ dept, appBase }: DeptAppProps) {
  const api = useMemo(() => seriesApi(appBase), [appBase]);
  const title = resolveDeptDisplay(dept.id, [dept]).name;
  const [params, setParams] = useSearchParams();
  const sid = params.get(SESSION_PARAM) || "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [stage, setStage] = useState<TabId>("overview");
  const [picked, setPicked] = useState<Partial<Record<StageId, string>>>({});
  const [focusRef, setFocusRef] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [draft, setDraftState] = useState<Draft>({ text: "", refs: [] });
  const [focusTick, setFocusTick] = useState(0);
  const [error, setError] = useState("");
  const [publishedRef, setPublishedRef] = useState("");
  const [fresh, setFresh] = useState<{ ref: string; label: string } | null>(null);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [sheet, setSheet] = useState(false);
  const [view, setViewState] = useState<SeriesView>(readView);
  const [filePath, setFilePath] = useState("");
  const wide = useWide();
  const dirty = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const selected = stage === "overview" ? "" : picked[stage] || "";

  const setDraft = useCallback((update: (d: Draft) => Draft) => setDraftState(update), []);
  const onDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
  const leaveEdit = () => !dirty.current || window.confirm("有没保存的修改，放弃吗？");

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

  useEffect(() => {
    setPicked({}); setFocusRef(undefined); setPublishedRef(""); setFresh(null); setFilePath("");
    void loadStatus(projectId);
  }, [projectId, loadStatus]);

  // A project just opened: start on its overview.
  const landed = useRef("");
  useEffect(() => {
    if (!status || landed.current === status.project_id) return;
    landed.current = status.project_id;
    setStage("overview");
  }, [status]);

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

  const show = useCallback((logical: string, kind: string, ref?: string) => {
    const s = stageOf(kind);
    setStage(s);
    setPicked(p => ({ ...p, [s]: logical }));
    setFocusRef(ref);
  }, []);

  // After a publish: jump there if the user isn't in the middle of something else, else offer a link.
  useEffect(() => {
    if (!publishedRef || !status) return;
    const item = status.items.find(i => i.latest === publishedRef || i.canonical === publishedRef);
    if (!item) return;
    setPublishedRef("");
    // Reading the overview is not idle: offer the link instead of pulling the page away.
    const idle = view === "structured" && stage !== "overview" && (!selected || selected === item.logical);
    if (idle && !dirty.current) show(item.logical, item.kind, publishedRef);
    else setFresh({ ref: publishedRef, label: refLabel(status, publishedRef) });
  }, [publishedRef, status]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const connected = chat.conn.kind === "open";

  // Session list titles / busy flags follow the chat.
  useEffect(() => { if (sid) void loadSessions().catch(() => undefined); }, [sid, chat.busy, loadSessions]);

  const addRef = useCallback((ref: ChatRef) => {
    setDraftState(d => (d.refs.some(r => r.ref === ref.ref) || d.refs.length >= REF_LIMIT ? d : { ...d, refs: [...d.refs, ref] }));
    setFocusTick(t => t + 1);
    if (!wide) setSheet(false);
  }, [wide]);

  const quote = useCallback((ref: ChatRef, text: string) => {
    const block = text.split("\n").map(l => `> ${l}`).join("\n");
    setDraftState(d => ({
      text: `${d.text.trim() ? `${d.text.trimEnd()}\n\n` : ""}${block}\n\n`,
      refs: d.refs.some(r => r.ref === ref.ref) || d.refs.length >= REF_LIMIT ? d.refs : [...d.refs, ref],
    }));
    setFocusTick(t => t + 1);
    if (!wide) setSheet(false);
  }, [wide]);

  const suggest = useCallback((text: string) => {
    setDraftState(d => ({ ...d, text }));
    setFocusTick(t => t + 1);
    if (!wide) setSheet(false);
  }, [wide]);

  const send = useCallback((text: string, refs: ChatRef[]) => {
    const ok = chat.send(text, refs);
    if (ok && !wide) setSheet(false);
    return ok;
  }, [chat, wide]);

  const selectInStage = (logical: string) => {
    if (stage === "overview" || logical === selected || !leaveEdit()) return;
    setPicked(p => ({ ...p, [stage]: logical }));
    setFocusRef(undefined);
  };
  const changeStage = (s: TabId) => {
    if (s === stage || !leaveEdit()) return;
    setStage(s);
    setFocusRef(undefined);
  };
  const setView = (next: SeriesView) => {
    setViewState(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private mode */ }
  };
  // Switching to files shows the file of the item that is open in the structured view.
  const changeView = (next: SeriesView) => {
    if (next === view || (view === "structured" && !leaveEdit())) return;
    const item = next === "files" && selected && status ? status.items.find(i => i.logical === selected) : undefined;
    if (item && status) {
      const ref = focusRef && logicalOf(focusRef) === item.logical ? focusRef : itemRef(item);
      const path = projectPath(ref, status.project_id);
      // The file you left is that very version (its md, or one of its images): come back to it.
      if (!filePath.startsWith(path.replace(/\.md$/, "."))) setFilePath(path);
    }
    setView(next);
  };
  /** A ref from the chat or a toast: the item in the structured view, or the file in the files view (where plain files live too). */
  const openRef = (ref: string, target: SeriesView = view) => {
    const logical = logicalOf(ref);
    const item = status?.items.find(i => i.logical === logical || i.latest === ref || i.canonical === ref);
    if (target === "files" || !item) {
      if (!status) { setError(`「${refLabel(status, ref)}」不在当前项目里`); return; }
      if (view === "structured" && !leaveEdit()) return;
      setFilePath(projectPath(ref, status.project_id));
      setView("files");
    } else {
      if ((item.logical !== selected || view !== "structured") && !leaveEdit()) return;
      show(item.logical, item.kind, /@v\d+$/.test(ref) ? ref : undefined);
      setView("structured");
    }
    setFresh(null);
    if (wide && !layout.workspace) toggleWorkspace(true);
    if (!wide) setSheet(true);
  };

  const switchProject = async (pid: string) => {
    if (!sid || pid === projectId || !leaveEdit()) return;
    try {
      await api.setProject(sid, pid);
      setProjectId(pid);
      setDraftState(d => ({ ...d, refs: [] }));
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

  const toggleWorkspace = (on = !layout.workspace) => {
    const next = { ...layout, workspace: on };
    setLayout(next);
    saveLayout(next);
  };

  // Drag the divider to give chat or the workspace more room; double-click resets.
  const resize = (e: React.PointerEvent) => {
    const box = body.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    let width = layout.chat;
    const move = (ev: PointerEvent) => {
      width = Math.round(Math.min(Math.max(ev.clientX - box.left, CHAT_MIN), box.width - WORK_MIN));
      setLayout(l => ({ ...l, chat: width }));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setLayout(l => { saveLayout(l); return l; });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  if (!sid) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">
      {error || <><LoaderCircle size={16} aria-hidden className="me-2 animate-spin" />打开会话…</>}
    </div>;
  }

  const project = projects.find(p => p.project_id === projectId);
  const workspace = (
    <Workspace api={api} status={status} view={view} onView={changeView} filePath={filePath} onFilePath={setFilePath}
      onStructured={ref => openRef(ref, "structured")}
      stage={stage} onStage={changeStage} selected={selected} focusRef={focusRef}
      onShow={item => { if (leaveEdit()) { show(item.logical, item.kind); setView("structured"); } }}
      onOpenFile={path => { if (!leaveEdit()) return; setFilePath(path); setView("files"); }}
      onSelect={selectInStage} refreshKey={refreshKey} busy={chat.busy} connected={connected}
      onSend={send} onRef={addRef} onQuote={quote} onOpen={openRef} onSuggest={suggest}
      onChanged={() => { void loadStatus(projectId); setRefreshKey(k => k + 1); }} onDirty={onDirty} />
  );
  const showSide = wide && layout.workspace;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="relative z-30 flex shrink-0 items-center gap-2 border-b border-border-solid bg-surface/60 px-2 py-1.5 text-sm">
        <Popover label="切换项目" disabled={chat.busy} title={chat.busy ? "正在回复，等这一轮结束再切换项目" : "切换项目"} className="max-w-[8.5rem] sm:max-w-[16rem]"
          trigger={<>
            <FolderOpen size={15} aria-hidden className="shrink-0 text-primary" />
            <span className="truncate font-medium text-heading">{status?.title || project?.title || (projectId || "还没选项目")}</span>
            <ChevronDown size={13} aria-hidden className="shrink-0 text-muted" />
          </>}>
          {close => (
            <div className="flex max-h-[60vh] flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {!projects.length && <p className="px-3 py-3 text-xs text-muted">还没有项目。</p>}
                {projects.map(p => (
                  <button key={p.project_id} type="button" role="menuitem" onClick={() => { close(); void switchProject(p.project_id); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-3">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${p.project_id === projectId ? "text-primary" : "text-heading"}`}>{p.title}</span>
                      {p.updated_at && <span className="block text-[11px] text-dim">{timeLabel(p.updated_at)}</span>}
                    </span>
                    {p.project_id === projectId && <Check size={13} aria-hidden className="text-primary" />}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { close(); suggest("我想新开一部剧："); }}
                className="flex items-center gap-2 border-t border-border-solid px-3 py-2 text-sm text-primary hover:bg-surface-3">
                <Plus size={14} aria-hidden />新开一部剧…
              </button>
            </div>
          )}
        </Popover>
        <ChevronRight size={13} aria-hidden className="-mx-1 shrink-0 text-dim" />
        <SessionPicker sessions={sessions} sid={sid} projects={projects} busy={chat.busy} conn={chat.conn}
          onOpenSession={openSession} onNewSession={() => void newSession()} />
        <div className="ms-1 min-w-0 flex-1 overflow-hidden"><JobsBar jobs={status?.jobs || []} /></div>
        {wide ? (
          <button type="button" onClick={() => toggleWorkspace()} aria-pressed={layout.workspace} title={layout.workspace ? "收起产出物，专心对话" : "展开产出物"}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-heading">
            {layout.workspace ? <PanelRightClose size={15} aria-hidden /> : <PanelRightOpen size={15} aria-hidden />}产出物
          </button>
        ) : (
          <button type="button" onClick={() => setSheet(true)}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border-solid px-2 py-1 text-xs text-body hover:border-primary hover:text-primary">
            <LayoutGrid size={13} aria-hidden />产出物{status?.items.length ? ` ${status.items.length}` : ""}
          </button>
        )}
      </header>
      {error && (
        <div role="alert" className="flex items-center gap-2 border-b border-border-solid px-3 py-1.5 text-xs text-fusion">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="关闭"><X size={13} aria-hidden /></button>
        </div>
      )}
      <div ref={body} className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-col" style={showSide ? { width: layout.chat, flexShrink: 0 } : { flex: 1 }}>
          <ChatPane title={title} messages={chat.messages} live={chat.live} pending={chat.pending} conn={chat.conn}
            error={chat.error} busy={chat.busy} draft={draft} setDraft={setDraft} focusTick={focusTick}
            status={status} sid={sid} mediaSrc={api.mediaSrc} onOpenRef={openRef}
            onSend={chat.send} onAnswer={chat.answer} onCancel={chat.cancel} onRetry={chat.retry} onClearError={chat.clearError} />
        </div>
        {showSide && (
          <>
            <div role="separator" aria-orientation="vertical" aria-label="拖动调整宽度" title="拖动调整宽度，双击还原"
              onPointerDown={resize} onDoubleClick={() => { const next = { ...layout, chat: 460 }; setLayout(next); saveLayout(next); }}
              className="group relative w-px shrink-0 cursor-col-resize bg-border-solid">
              <span className="absolute inset-y-0 -start-1.5 -end-1.5 z-10" />
              <span className="absolute inset-y-0 start-0 w-px bg-primary/0 transition-colors group-hover:bg-primary/60" />
            </div>
            {workspace}
          </>
        )}
        {!wide && sheet && (
          <div role="dialog" aria-label="产出物" className="absolute inset-0 z-40 flex flex-col bg-bg animate-in fade-in slide-in-from-bottom-4">
            <div className="flex shrink-0 items-center border-b border-border-solid px-3 py-1.5 text-xs text-muted">
              <span className="flex-1">产出物 · 拖进对话或点「引用到对话」接着问</span>
              <button type="button" onClick={() => { if (leaveEdit()) setSheet(false); }} aria-label="回到对话" className="rounded p-1 hover:text-heading"><X size={16} aria-hidden /></button>
            </div>
            {workspace}
          </div>
        )}
        {fresh && (showSide || sheet) && (
          <div role="status" className="absolute bottom-4 end-4 z-30 flex items-center gap-2 rounded-lg border border-spark-blue/40 bg-surface-2 px-3 py-2 text-xs text-body shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <span className="h-1.5 w-1.5 rounded-full bg-spark-blue" aria-hidden />
            主创刚出了「{fresh.label}」
            <button type="button" onClick={() => openRef(fresh.ref)} className="font-medium text-primary hover:underline">去看看</button>
            <button type="button" onClick={() => setFresh(null)} aria-label="关闭" className="text-muted hover:text-heading"><X size={12} aria-hidden /></button>
          </div>
        )}
      </div>
    </div>
  );
}
