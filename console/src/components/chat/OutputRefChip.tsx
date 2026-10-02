import { File, FileSpreadsheet, Pin, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatRef } from "../../lib/chatRefs";
import { useOutputInteractions } from "../outputs/OutputInteractionProvider";

export function OutputRefChip({ refItem, onRemove, onTogglePin, pinned = false, showParent }: {
  refItem: ChatRef; onRemove?: () => void; onTogglePin?: () => void; pinned?: boolean; showParent?: boolean;
}) {
  const { t } = useTranslation();
  const { openOutput, fileStates, nodes } = useOutputInteractions();
  const output = refItem.type === "output" ? refItem : null;
  const Icon = output && ["table", "sheet"].includes(output.kind || "") ? FileSpreadsheet : File;
  const find = (items: typeof nodes): number | undefined => {
    for (const item of items) {
      if (item.path === output?.path) return item.mtime;
      const result = item.children && find(item.children);
      if (result !== undefined) return result;
    }
  };
  const updated = output?.mtime && find(nodes) > output.mtime;
  const parent = output?.path.substring(0, output.path.lastIndexOf("/"));
  const state = output && fileStates[output.path];
  return <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-heading">
    <Icon size={13} className="shrink-0 text-muted" aria-hidden />
    <button type="button" disabled={!output} onClick={() => output && openOutput(output.path)}
      title={output?.path || refItem.detail || refItem.label} className="min-w-0 truncate text-start hover:text-primary disabled:text-heading">
      {refItem.label}{showParent && parent ? ` · ${parent}` : ""}
    </button>
    {updated ? <span className="text-muted" title={t("outputs.refs.updated")}>↻</span> : null}
    {state && <span className="text-fusion" title={t(`outputs.refs.${state}`)}>!</span>}
    {onTogglePin && <button type="button" onClick={onTogglePin} aria-pressed={pinned}
      aria-label={t(pinned ? "outputs.refs.unpin" : "outputs.refs.pin", { name: refItem.label })}
      title={t(pinned ? "outputs.refs.unpin" : "outputs.refs.pin", { name: refItem.label })}
      className={`shrink-0 rounded p-0.5 hover:bg-primary/10 ${pinned ? "bg-primary/15 text-primary" : "text-muted hover:text-primary"}`}>
      <Pin size={13} fill={pinned ? "currentColor" : "none"} aria-hidden />
    </button>}
    {onRemove && <button type="button" onClick={onRemove} aria-label={t("outputs.refs.remove", { name: refItem.label })}
      className="shrink-0 text-muted hover:text-fusion"><X size={13} /></button>}
  </span>;
}
