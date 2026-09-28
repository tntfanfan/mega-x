import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight, ChevronRight, Download, File, FileCode2, FileSpreadsheet, FileText,
  Film, Folder, FolderOpen, Image, Music2,
} from "lucide-react";

import { fetchTree, rawUrl, type OutputFile, type OutputNode } from "../../lib/outputs";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { useHorizontalSplit } from "../../hooks/useHorizontalSplit";
import { OutputPreview } from "./OutputPreview";

function flatten(nodes: OutputNode[]): OutputFile[] {
  const out: OutputFile[] = [];
  for (const node of nodes) {
    if (node.children?.length) out.push(...flatten(node.children));
    else if (node.kind !== "dir") out.push(node);
  }
  return out;
}

function forDept(nodes: OutputNode[], deptId: string): OutputNode[] {
  return nodes.flatMap((node) => {
    if (node.kind !== "dir") return node.dept_id === deptId ? [node] : [];
    const children = forDept(node.children || [], deptId);
    return children.length ? [{ ...node, children }] : [];
  });
}

function directories(nodes: OutputNode[]): string[] {
  return nodes.flatMap((node) => node.kind === "dir"
    ? [node.path, ...directories(node.children || [])]
    : []);
}

function FileIcon({ kind }: { kind: string }) {
  const Icon = kind === "image" ? Image
    : kind === "video" ? Film
      : kind === "audio" ? Music2
        : kind === "table" || kind === "sheet" ? FileSpreadsheet
          : ["code", "json", "yaml", "html"].includes(kind) ? FileCode2
            : ["markdown", "text", "doc", "pdf", "slides"].includes(kind) ? FileText
              : File;
  return <Icon size={15} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />;
}

function Tree({
  nodes, selected, onSelect, expanded, onToggle, depth = 0,
}: {
  nodes: OutputNode[];
  selected: string;
  onSelect: (file: OutputFile) => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "ms-3 border-s border-border-solid/70 ps-2"}>
      {nodes.map((node) => {
        const dir = node.kind === "dir";
        const isExpanded = expanded.has(node.path);
        const active = selected === node.path;
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => dir ? onToggle(node.path) : onSelect(node)}
              aria-expanded={dir ? isExpanded : undefined}
              aria-current={active ? "true" : undefined}
              title={node.path}
              className={`flex w-full min-w-0 items-center gap-1.5 border-s-2 px-1.5 py-1 text-start text-xs transition-colors ${
                active ? "border-primary bg-surface-2 text-primary" : "border-transparent text-body hover:bg-surface-2 hover:text-heading"
              }`}
            >
              {dir ? (
                <>
                  <ChevronRight size={13} className={`shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} aria-hidden />
                  {isExpanded ? <FolderOpen size={15} strokeWidth={1.8} className="shrink-0 text-primary/70" aria-hidden /> : <Folder size={15} strokeWidth={1.8} className="shrink-0 text-primary/70" aria-hidden />}
                </>
              ) : (
                <>
                  <span className="w-[13px] shrink-0" />
                  <FileIcon kind={node.kind} />
                </>
              )}
              <span className={`min-w-0 flex-1 truncate ${dir && depth === 0 ? "font-medium" : ""}`}>{node.label || node.name}</span>
            </button>
            {dir && isExpanded && node.children?.length ? (
              <Tree nodes={node.children} selected={selected} onSelect={onSelect} expanded={expanded} onToggle={onToggle} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function OutputsPane({
  scope,
  deptId,
  taskId,
  className = "",
}: {
  scope: WorkspaceScope;
  deptId?: string;
  taskId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [nodes, setNodes] = useState<OutputNode[]>([]);
  const [scopeMode, setScopeMode] = useState<"dept" | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const initializedRoots = useRef<Set<string>>(new Set());
  const {
    containerRef: treeSplitRef,
    ratio: treeSplit,
    onPointerDown: startTreeSplit,
    onKeyDown: onTreeSplitKeyDown,
  } = useHorizontalSplit({
    storageKey: "lgh.outputs.treeSplit",
    initialRatio: 0.4,
    minStart: 170,
    minEnd: 140,
  });
  const selectedPath = params.get("file") || "";

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    setNodes([]);
    const load = () => {
      if (document.visibilityState !== "visible") return;
      const prefix = taskId ? `tasks/${taskId}` : "";
      // Task outputs are nested under runs/steps; four levels leaves them invisible.
      fetchTree(scope, prefix, 16).then((result) => {
        if (!stopped) setNodes(result);
      }).catch(() => {});
    };
    load();
    timer = window.setInterval(load, taskId ? 5000 : 30000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [scope.base, taskId]);

  const visible = useMemo(
    () => !taskId && scopeMode === "dept" && deptId ? forDept(nodes, deptId) : nodes,
    [nodes, taskId, scopeMode, deptId],
  );
  const files = useMemo(() => flatten(visible), [visible]);
  const dirPaths = useMemo(() => directories(visible), [visible]);
  const allExpanded = dirPaths.length > 0 && dirPaths.every((path) => expanded.has(path));
  const selected = files.find((file) => file.path === selectedPath) || null;

  useEffect(() => {
    const fresh = nodes.filter((node) => node.kind === "dir" && !initializedRoots.current.has(node.path));
    if (fresh.length === 0) return;
    for (const node of fresh) initializedRoots.current.add(node.path);
    setExpanded((current) => new Set([...current, ...fresh.map((node) => node.path)]));
  }, [nodes]);

  useEffect(() => {
    if (files.length === 0 || selected) return;
    const next = new URLSearchParams(params);
    next.set("file", files[0].path);
    setParams(next, { replace: true });
  }, [files, selected, params, setParams]);

  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((current) => {
      const next = new Set(current);
      const parts = selectedPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join("/"));
      }
      return next.size === current.size ? current : next;
    });
  }, [selectedPath]);

  function choose(file: OutputFile) {
    const next = new URLSearchParams(params);
    next.set("file", file.path);
    setParams(next, { replace: true });
  }

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <aside aria-label={t("outputs.title")} className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-s border-border-solid bg-surface/30 ${className}`}>
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border-solid bg-surface/60 px-3">
        <h2 className="min-w-0 flex-1 truncate text-xs uppercase tracking-widest text-muted">{t("outputs.title")}</h2>
        <span className="text-xs text-muted" aria-label={t("outputs.file-count", { count: files.length })}>{files.length}</span>
        {!taskId && deptId && (
          <select
            aria-label={t("outputs.scope-label")}
            value={scopeMode}
            onChange={(e) => setScopeMode(e.target.value as "dept" | "all")}
            className="min-w-0 max-w-32 rounded-md border border-border-solid bg-surface px-2 py-1 text-xs text-body"
          >
            <option value="all">{t("outputs.scope-all")}</option>
            <option value="dept">{t("outputs.scope-dept")}</option>
          </select>
        )}
      </div>

      <div ref={treeSplitRef} className="flex min-h-0 min-w-0 flex-1" style={{ "--tree-split": `${treeSplit * 100}%` } as CSSProperties}>
        <nav aria-label={t("outputs.files")} className="outputs-tree flex min-w-0 shrink-0 flex-col bg-surface/30">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-solid px-3 text-[11px] uppercase tracking-wider text-muted">
            <span>{t("outputs.files")}</span>
            {dirPaths.length > 0 && (
              <button type="button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(dirPaths))} className="text-primary hover:underline" title={t(allExpanded ? "outputs.collapse-all" : "outputs.expand-all")}>
                {t(allExpanded ? "outputs.collapse-all" : "outputs.expand-all")}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted">{t("outputs.empty")}</p>
            ) : (
              <Tree nodes={visible} selected={selectedPath} onSelect={choose} expanded={expanded} onToggle={toggle} />
            )}
          </div>
        </nav>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("outputs.resize-tree")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(treeSplit * 100)}
          tabIndex={0}
          title={t("outputs.resize-tree")}
          onPointerDown={startTreeSplit}
          onKeyDown={onTreeSplitKeyDown}
          className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-border-solid/60 hover:bg-primary/10 focus-visible:bg-primary/10"
        >
          <span className="h-10 w-0.5 rounded-full bg-border-solid transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>

        <section aria-label={t("outputs.preview")} className="outputs-preview flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border-solid px-3">
            <div className="min-w-0 flex-1">
              {selected ? (
                <div className="flex min-w-0 flex-col justify-center">
                  <span className="truncate text-xs font-medium text-heading" title={selected.path}>{selected.name}</span>
                  {selected.path !== selected.name && <span className="truncate text-[10px] text-muted" title={selected.path}>{selected.path}</span>}
                </div>
              ) : (
                <span className="text-xs text-muted">{t("outputs.preview")}</span>
              )}
            </div>
            {selected && (
              <>
                {selected.task_id && scope.kind === "company" && (
                  <Link className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-primary" to={`${scope.routeBase}/tasks/${selected.task_id}`} title={t("outputs.locate-task")} aria-label={t("outputs.locate-task")}>
                    <ArrowUpRight size={14} aria-hidden />
                    <span className="outputs-action-label">{t("outputs.locate-task")}</span>
                  </Link>
                )}
                <a className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border-solid px-1.5 text-[11px] text-body hover:border-primary hover:text-primary" href={rawUrl(scope, selected.path, true)} title={t("outputs.download")} aria-label={t("outputs.download")}>
                  <Download size={14} aria-hidden />
                  <span className="outputs-action-label">{t("outputs.download")}</span>
                </a>
              </>
            )}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <OutputPreview scope={scope} file={selected} />
          </div>
        </section>
      </div>
    </aside>
  );
}
