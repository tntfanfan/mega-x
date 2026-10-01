import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ArrowUpRight, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download,
  File, FileCode2, FileSpreadsheet, FileText, Film, Folder, FolderInput, FolderOpen,
  Home, Image, LocateFixed, Music2, PanelLeftClose, PanelLeftOpen, Search, X,
} from "lucide-react";

import { fetchMeta, fetchTree, rawUrl, type OutputFile, type OutputNode } from "../../lib/outputs";
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

function findDirectory(nodes: OutputNode[], path: string): OutputNode | undefined {
  for (const node of nodes) {
    if (node.kind !== "dir") continue;
    if (node.path === path) return node;
    const found = findDirectory(node.children || [], path);
    if (found) return found;
  }
}

function parentPath(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

/** A chain of single-child folders can share one row without hiding any files. */
function directoryChain(node: OutputNode): OutputNode[] {
  const chain = [node];
  let current = node;
  while (current.kind === "dir" && current.children?.length === 1 && current.children[0].kind === "dir") {
    current = current.children[0];
    chain.push(current);
  }
  return chain;
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
  nodes, selected, onSelect, expanded, onToggle, onOpenFolder, depth = 0,
}: {
  nodes: OutputNode[];
  selected: string;
  onSelect: (file: OutputFile) => void;
  expanded: Set<string>;
  onToggle: (paths: string[]) => void;
  onOpenFolder: (path: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  return (
    <ul className="w-full min-w-0 space-y-0.5">
      {nodes.map((node) => {
        const dir = node.kind === "dir";
        const chain = dir ? directoryChain(node) : [node];
        const terminal = chain[chain.length - 1];
        const isExpanded = expanded.has(node.path);
        const active = selected === node.path;
        const parentLabel = chain.slice(0, -1).map((part) => part.label || part.name).join(" / ");
        return (
          <li key={node.path} className="min-w-0">
            <div className={`group flex min-w-0 items-center rounded border-s-2 transition-colors ${
              active ? "border-primary bg-surface-2 text-primary" : "border-transparent text-body hover:bg-surface-2 hover:text-heading"
            }`}>
              <button
                type="button"
                onClick={() => dir ? onToggle(chain.map((part) => part.path)) : onSelect(node)}
                onDoubleClick={dir ? () => onOpenFolder(terminal.path) : undefined}
                aria-expanded={dir ? isExpanded : undefined}
                aria-current={active ? "true" : undefined}
                title={terminal.path}
                style={{ paddingInlineStart: 6 + Math.min(depth, 3) * 10 }}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pe-1.5 text-start text-xs"
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
                {dir ? <span className={`flex min-w-0 flex-1 items-center gap-1 ${depth === 0 ? "font-medium" : ""}`}>
                  {parentLabel && <><span className="max-w-[35%] truncate text-muted">{parentLabel}</span><span className="shrink-0 text-muted">/</span></>}
                  <span className="min-w-0 flex-1 truncate">{terminal.label || terminal.name}</span>
                </span> : <span className="min-w-0 flex-1 break-all line-clamp-2 leading-4">{node.label || node.name}</span>}
              </button>
              {dir && <button type="button" onClick={() => onOpenFolder(terminal.path)}
                aria-label={t("outputs.open-folder", { name: terminal.label || terminal.name })}
                title={t("outputs.open-folder", { name: terminal.label || terminal.name })}
                className="outputs-folder-enter me-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted opacity-0 hover:bg-primary/10 hover:text-primary group-hover:opacity-100 group-focus-within:opacity-100">
                <FolderInput size={14} aria-hidden />
              </button>}
            </div>
            {dir && isExpanded && terminal.children?.length ? (
              <Tree nodes={terminal.children} selected={selected} onSelect={onSelect} expanded={expanded} onToggle={onToggle} onOpenFolder={onOpenFolder} depth={depth + 1} />
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
  headerActions,
  className = "",
}: {
  scope: WorkspaceScope;
  deptId?: string;
  taskId?: string;
  headerActions?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [nodes, setNodes] = useState<OutputNode[]>([]);
  const [scopeMode, setScopeMode] = useState<"dept" | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<"preview" | "source">("preview");
  const [query, setQuery] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [compact, setCompact] = useState(false);
  const [treeOpen, setTreeOpen] = useState<boolean | null>(null);
  const paneRef = useRef<HTMLElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const revealSelectedRef = useRef(true);
  const showTree = treeOpen ?? !compact;
  const initializedRoots = useRef<Set<string>>(new Set());
  const {
    containerRef: treeSplitRef,
    ratio: treeSplit,
    onPointerDown: startTreeSplit,
    onKeyDown: onTreeSplitKeyDown,
  } = useHorizontalSplit({
    storageKey: "lgh.outputs.treeSplit",
    initialRatio: 0.28,
    minStart: 160,
    minEnd: 240,
  });
  const selectedPath = params.get("file") || "";
  const [locatedFile, setLocatedFile] = useState<OutputFile | null>(null);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width <= 440));
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    setNodes([]);
    setFolderPath("");
    setQuery("");
    setExpanded(new Set());
    initializedRoots.current.clear();
    revealSelectedRef.current = true;
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
  const folder = useMemo(() => folderPath ? findDirectory(visible, folderPath) : undefined, [visible, folderPath]);
  const treeNodes = useMemo(() => folder ? folder.children || [] : visible, [folder, visible]);
  const dirPaths = useMemo(() => directories(treeNodes), [treeNodes]);
  const searchResults = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? flatten(treeNodes).filter((file) => {
      const text = `${file.name} ${file.label || ""} ${file.path}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    }) : null;
  }, [treeNodes, query]);
  const allExpanded = dirPaths.length > 0 && dirPaths.every((path) => expanded.has(path));
  const selected = files.find((file) => file.path === selectedPath) || (locatedFile?.path === selectedPath ? locatedFile : null);
  useEffect(() => {
    let cancelled = false;
    setLocatedFile(null);
    if (selectedPath && !files.some(file => file.path === selectedPath)) {
      fetchMeta(scope, selectedPath).then(file => { if (!cancelled) setLocatedFile(file); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [scope.base, selectedPath]);

  useEffect(() => {
    const fresh = visible.filter((node) => node.kind === "dir" && !initializedRoots.current.has(node.path));
    if (fresh.length === 0) return;
    for (const node of fresh) initializedRoots.current.add(node.path);
    setExpanded((current) => new Set([...current, ...fresh.flatMap((node) => directoryChain(node).map((part) => part.path))]));
  }, [visible]);

  useEffect(() => {
    if (files.length === 0 || selected || selectedPath) return;
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
  }, [selectedPath, scope.base, taskId]);

  useEffect(() => {
    revealSelectedRef.current = true;
  }, [selectedPath, folderPath, query, showTree]);

  useEffect(() => {
    if (!showTree || !revealSelectedRef.current) return;
    const container = treeScrollRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !active) return;
    const viewport = container.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    if (!row.height) return;
    revealSelectedRef.current = false;
    if (row.top < viewport.top || row.bottom > viewport.bottom) {
      container.scrollTop += row.top - viewport.top - (viewport.height - row.height) / 2;
    }
  }, [selectedPath, folderPath, query, expanded, visible, showTree]);

  function choose(file: OutputFile) {
    const next = new URLSearchParams(params);
    next.set("file", file.path);
    setParams(next, { replace: true });
    if (compact) setTreeOpen(false);
  }

  function toggle(paths: string[]) {
    setExpanded((current) => {
      const next = new Set(current);
      const close = next.has(paths[0]);
      for (const path of paths) {
        if (close) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  }

  function openFolder(path: string) {
    setFolderPath(path);
    setQuery("");
    if (treeScrollRef.current) treeScrollRef.current.scrollTop = 0;
  }

  function goUp() {
    const parent = parentPath(folderPath);
    openFolder(findDirectory(visible, parent) ? parent : "");
  }

  function locateSelected() {
    revealSelectedRef.current = true;
    const parent = parentPath(selectedPath);
    openFolder(findDirectory(visible, parent) ? parent : "");
    setExpanded((current) => {
      const next = new Set(current);
      const parts = selectedPath.split("/");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
  }

  return (
    <aside ref={paneRef} aria-label={t("outputs.title")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && compact && showTree && !event.defaultPrevented) {
          event.stopPropagation();
          setTreeOpen(false);
        }
      }}
      className={`outputs-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-s border-border-solid bg-surface/30 ${className}`}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-solid bg-surface/60 px-3">
        <button type="button" onClick={() => setTreeOpen(!showTree)} aria-pressed={showTree}
          aria-label={t(showTree ? "outputs.hide-tree" : "outputs.show-tree")} title={t(showTree ? "outputs.hide-tree" : "outputs.show-tree")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-primary">
          {showTree ? <PanelLeftClose size={16} aria-hidden /> : <PanelLeftOpen size={16} aria-hidden />}
        </button>
        <h2 className="min-w-0 flex-1 truncate text-xs uppercase tracking-widest text-muted">{t("outputs.title")}</h2>
        <span className="text-xs text-muted" aria-label={t("outputs.file-count", { count: files.length })}>{files.length}</span>
        {!taskId && deptId && (
          <select
            aria-label={t("outputs.scope-label")}
            value={scopeMode}
            onChange={(e) => { setScopeMode(e.target.value as "dept" | "all"); openFolder(""); }}
            className="min-w-0 max-w-32 rounded-md border border-border-solid bg-surface px-2 py-1 text-xs text-body"
          >
            <option value="all">{t("outputs.scope-all")}</option>
            <option value="dept">{t("outputs.scope-dept")}</option>
          </select>
        )}
        {headerActions && <div className="outputs-header-actions flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>

      <div ref={treeSplitRef} data-tree-overlay={compact && showTree || undefined} className="outputs-layout relative flex min-h-0 min-w-0 flex-1" style={{ "--tree-split": `${treeSplit * 100}%` } as CSSProperties}>
        {compact && showTree && <button type="button" aria-label={t("outputs.hide-tree")} onClick={() => setTreeOpen(false)} className="absolute inset-0 z-10 bg-bg/60" />}
        <nav aria-label={t("outputs.files")} className={`outputs-tree ${showTree ? "flex" : "hidden"} min-h-0 min-w-0 shrink-0 flex-col bg-surface`}>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-solid px-2 text-xs text-muted">
            {folder && <>
              <button type="button" onClick={goUp} aria-label={t("outputs.parent-folder")} title={t("outputs.parent-folder")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-surface-2 hover:text-primary"><ArrowLeft size={14} aria-hidden /></button>
              <button type="button" onClick={() => openFolder("")} aria-label={t("outputs.all-files")} title={t("outputs.all-files")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-surface-2 hover:text-primary"><Home size={14} aria-hidden /></button>
            </>}
            <span className="min-w-0 flex-1 truncate" title={folder?.path}>{folder ? folder.label || folder.name : t("outputs.files")}</span>
            {selected && <button type="button" onClick={locateSelected} aria-label={t("outputs.locate-file")} title={t("outputs.locate-file")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-surface-2 hover:text-primary"><LocateFixed size={14} aria-hidden /></button>}
            {dirPaths.length > 0 && !searchResults && <button type="button" onClick={() => setExpanded((current) => {
              const next = new Set(current);
              for (const path of dirPaths) { if (allExpanded) next.delete(path); else next.add(path); }
              return next;
            })} aria-label={t(allExpanded ? "outputs.collapse-all" : "outputs.expand-all")} title={t(allExpanded ? "outputs.collapse-all" : "outputs.expand-all")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-surface-2 hover:text-primary">
              {allExpanded ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />}
            </button>}
          </div>
          <div className="mx-2 my-2 flex h-8 shrink-0 items-center gap-1.5 rounded border border-border-solid bg-bg/50 px-2 focus-within:border-primary">
            <Search size={13} className="shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && query) { event.stopPropagation(); setQuery(""); } }}
              aria-label={t("outputs.search-files")} placeholder={t("outputs.search-files")}
              className="outputs-search min-w-0 flex-1 bg-transparent text-xs text-body outline-none placeholder:text-muted" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label={t("outputs.clear-search")} title={t("outputs.clear-search")} className="shrink-0 rounded text-muted hover:text-primary"><X size={13} aria-hidden /></button>}
          </div>
          <div ref={treeScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted">{t("outputs.empty")}</p>
            ) : searchResults ? (
              searchResults.length ? <ul className="space-y-1">{searchResults.map((file) => <li key={file.path}>
                <button type="button" onClick={() => choose(file)} title={file.path} aria-current={selectedPath === file.path ? "true" : undefined}
                  className={`flex w-full min-w-0 items-start gap-2 rounded border-s-2 px-2 py-1.5 text-start text-xs ${selectedPath === file.path ? "border-primary bg-surface-2 text-primary" : "border-transparent text-body hover:bg-surface-2"}`}>
                  <FileIcon kind={file.kind} />
                  <span className="min-w-0 flex-1"><span className="block break-all line-clamp-2">{file.label || file.name}</span><span className="block truncate text-[10px] text-muted">{parentPath(file.path) || "/"}</span></span>
                </button>
              </li>)}</ul> : <p role="status" className="px-2 py-3 text-xs text-muted">{t("outputs.no-matches")}</p>
            ) : (
              <Tree nodes={treeNodes} selected={selectedPath} onSelect={choose} expanded={expanded} onToggle={toggle} onOpenFolder={openFolder} />
            )}
          </div>
        </nav>

        {showTree && !compact && <div
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
        </div>}

        <section aria-label={t("outputs.preview")} className="outputs-preview flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="outputs-file-toolbar flex h-10 shrink-0 items-center gap-1.5 border-b border-border-solid px-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-heading" title={selected?.path}>{selected?.name || t("outputs.preview")}</span>
            {selected && ["markdown", "table"].includes(selected.kind) && <div role="group" aria-label={t("outputs.view-label")} className="flex shrink-0 items-center gap-0.5 rounded bg-bg/50 p-0.5">
              {(["preview", "source"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
                title={mode === "source" ? t("source.readonly") : undefined}
                className={`h-7 whitespace-nowrap rounded px-2 text-xs ${view === mode ? "bg-surface-2 text-primary" : "text-muted hover:text-heading"}`}>
                {t(mode === "preview" ? "outputs.preview" : "outputs.source")}
              </button>)}
            </div>}
            {selected && (
              <>
                {selected.task_id && (
                  <Link className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-primary" to={`${scope.routeBase}${scope.kind === "sandbox" ? "?panel=tasks&focus=main&" : "/tasks?"}task=${encodeURIComponent(selected.task_id)}${selected.run_id ? `&run=${encodeURIComponent(selected.run_id)}` : ""}&file=${encodeURIComponent(selected.path)}`} title={t("outputs.locate-task")} aria-label={t("outputs.locate-task")}>
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
            <OutputPreview scope={scope} file={selected} view={view} />
          </div>
        </section>
      </div>
    </aside>
  );
}
