import type { DeptStatusItem } from "../../lib/deptStatus";

const DOT: Record<string, string> = {
  running: "bg-spark-blue",
  planning: "bg-ai",
  chatting: "bg-primary",
  queued: "bg-spark-flare",
  idle: "bg-dim",
  error: "bg-fusion",
};

export function DeptStatusBadge({ item }: { item?: DeptStatusItem | null }) {
  if (!item) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted min-w-0" title={item.label}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${DOT[item.state] || "bg-dim"}`} />
      <span className="truncate">{item.label}</span>
    </span>
  );
}
