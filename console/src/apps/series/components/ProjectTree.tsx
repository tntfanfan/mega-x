import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { STATUS_LABEL, STATUS_MARK, type ChatRef, type ProjectStatus, type StatusItem } from "../api";

export const REF_MIME = "application/x-series-ref";

const GROUPS = ["设定", "剧本", "分镜", "视频", "其他"];

export function dragRef(event: React.DragEvent, ref: ChatRef) {
  event.dataTransfer.setData(REF_MIME, JSON.stringify(ref));
  event.dataTransfer.setData("text/plain", ref.ref);
  event.dataTransfer.effectAllowed = "copy";
}

function itemRef(item: StatusItem): string {
  return item.canonical || item.latest;
}

function statusOf(item: StatusItem): string {
  if (item.canonical) return "canonical";
  return item.stale.length ? "stale" : item.latest_status;
}

/** 左栏：项目结构。✔ 定稿，⚠ stale；拖到输入框就成为引用。 */
export function ProjectTree({ status, selected, onSelect, onRef }: {
  status: ProjectStatus | null;
  selected: string;
  onSelect: (logical: string) => void;
  onRef: (ref: ChatRef) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const out: Record<string, StatusItem[]> = {};
    for (const item of status?.items || []) (out[item.group] ||= []).push(item);
    return GROUPS.filter(g => out[g]?.length).map(g => ({ name: g, items: out[g] }));
  }, [status]);

  if (!status) return <p className="p-4 text-xs text-muted">选一个项目，或者在聊天里让主创新建一部剧。</p>;
  if (!groups.length) return <p className="p-4 text-xs text-muted">「{status.title}」还没有产出物。</p>;
  return (
    <div className="space-y-1 p-2 text-sm">
      {groups.map(group => (
        <div key={group.name}>
          <button type="button" onClick={() => setClosed(c => ({ ...c, [group.name]: !c[group.name] }))}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs font-medium text-muted hover:text-heading">
            {closed[group.name] ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            {group.name}
            <span className="ms-auto tabular-nums">{group.items.length}</span>
          </button>
          {!closed[group.name] && (
            <ul className="ms-3 space-y-0.5">
              {group.items.map(item => {
                const state = statusOf(item);
                const ref = { ref: itemRef(item), label: item.label, project_id: status.project_id };
                return (
                  <li key={item.logical}>
                    <button type="button" draggable onDragStart={e => dragRef(e, ref)} onClick={() => onSelect(item.logical)}
                      onDoubleClick={() => onRef(ref)}
                      title={`${item.logical}\n${STATUS_LABEL[state] || state} · 拖到聊天或双击 = 引用`}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${selected === item.logical ? "bg-surface-2 text-primary" : "text-body hover:bg-surface-2"}`}>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className={`shrink-0 text-xs ${state === "canonical" ? "text-spark-mint" : state === "stale" ? "text-spark-flare" : "text-muted"}`}>
                        {STATUS_MARK[state] || ""}{state === "draft" ? "草稿" : state === "stale" ? "stale" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      <p className="px-2 pt-3 text-[11px] text-muted">拖到聊天 = 引用</p>
    </div>
  );
}
