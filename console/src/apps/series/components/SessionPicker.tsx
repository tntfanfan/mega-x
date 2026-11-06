import { useState } from "react";
import { Check, ChevronDown, MessagesSquare, Plus, Search } from "lucide-react";
import type { ProjectSummary, Session } from "../api";
import type { ConnectionState } from "../socket";
import { timeLabel } from "../stages";
import { Popover, StatusDot } from "./bits";

/** 顶栏里「项目 › 对话」的后半截：切换对话、开新对话，连接状态是名字旁边那个点。 */
export function SessionPicker({ sessions, sid, projects, busy, conn, onOpenSession, onNewSession }: {
  sessions: Session[];
  sid: string;
  projects: ProjectSummary[];
  busy: boolean;
  conn: ConnectionState;
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
}) {
  const [query, setQuery] = useState("");
  const current = sessions.find(s => s.id === sid);
  const titleOf = (pid?: string | null) => (pid ? projects.find(p => p.project_id === pid)?.title || pid : "");
  const shown = sessions.filter(s => !query.trim() || `${s.title} ${titleOf(s.project_id)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const connTitle = conn.kind === "open" ? "已连接" : conn.kind === "fatal" ? "连接断开" : "连接中";
  return (
    <>
      <Popover label="切换对话" title={`切换对话 · ${connTitle}`} className="max-w-[8.5rem] sm:max-w-[16rem]"
        trigger={<>
          <MessagesSquare size={14} aria-hidden className="shrink-0 text-muted" />
          <span className="truncate text-heading">{current?.title || "新对话"}</span>
          <StatusDot tone={conn.kind === "open" ? "canonical" : conn.kind === "fatal" ? "stale" : "draft"} />
          <ChevronDown size={13} aria-hidden className="shrink-0 text-muted" />
        </>}>
        {close => (
          <div className="flex max-h-[60vh] flex-col">
            <div className="flex items-center gap-2 border-b border-border-solid px-3 py-2">
              <Search size={13} aria-hidden className="text-muted" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="找对话…" aria-label="找对话"
                className="min-w-0 flex-1 bg-transparent text-sm text-heading outline-none placeholder:text-dim" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {!shown.length && <p className="px-3 py-3 text-xs text-muted">没有匹配的对话。</p>}
              {shown.map(s => (
                <button key={s.id} type="button" role="menuitem" onClick={() => { onOpenSession(s.id); close(); }}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-3 ${s.id === sid ? "bg-surface-3/60" : ""}`}>
                  <span className="mt-1.5">{s.busy ? <StatusDot tone="newer" className="animate-pulse" /> : <span className="inline-block h-1.5 w-1.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${s.id === sid ? "text-primary" : "text-heading"}`}>{s.title || "新对话"}</span>
                    <span className="block truncate text-[11px] text-dim">{[titleOf(s.project_id), timeLabel(s.updated_at || s.created_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {s.id === sid && <Check size={13} aria-hidden className="mt-1 text-primary" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { onNewSession(); close(); }}
              className="flex items-center gap-2 border-t border-border-solid px-3 py-2 text-sm text-primary hover:bg-surface-3">
              <Plus size={14} aria-hidden />新对话
            </button>
          </div>
        )}
      </Popover>
      <button type="button" onClick={onNewSession} aria-label="新对话" title={busy ? "新对话（当前这轮会在后台继续）" : "新对话"}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-primary">
        <Plus size={14} aria-hidden /><span className="hidden sm:inline">新对话</span>
      </button>
    </>
  );
}
