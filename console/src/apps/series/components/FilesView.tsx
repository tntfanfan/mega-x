import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Check, ChevronRight, ChevronsDownUp, Copy, ExternalLink, File, FileAudio, FileImage, FileJson, FileText,
  FileVideo, Folder, FolderOpen, FolderTree, Info, LayoutGrid, LoaderCircle, MessageSquarePlus, Search, X,
} from "lucide-react";
import { SourceEditorPane } from "../../../components/ui/SourceEditorPane";
import { apiErrorMessage } from "../../../lib/api";
import type { ChatRef, FileContent, FileOwner, FileTree, ProjectStatus, SeriesApi } from "../api";
import { dragRef } from "../drag";
import {
  aboutPath, ancestors, baseName, buildTree, fileType, findNode, rowOf, sizeLabel, splitName, visibleRows,
  type FileNode, type FileType,
} from "../files";
import { refLabel, timeLabel } from "../stages";
import { noteOf, splitFrontmatter } from "../notes";
import { StatusDot, isTyping, toneOf } from "./bits";
import { FieldsCard, MdBody, NotePreview } from "./Doc";

type Props = {
  api: SeriesApi;
  status: ProjectStatus;
  refreshKey: number;
  path: string;
  onPath: (path: string) => void;
  /** A folder the breadcrumb asked to show: expand it and move the cursor there. */
  reveal: { path: string; tick: number } | null;
  wide: boolean;
  onRef: (ref: ChatRef) => void;
  onStructured: (ref: string) => void;
};

const TYPE_ICON: Record<FileType, typeof File> = {
  markdown: FileText, json: FileJson, text: FileText, image: FileImage, video: FileVideo, audio: FileAudio, pdf: FileText, other: File,
};
const ROLE_TEXT: Record<FileOwner["role"], string> = { text: "", media: " 的素材", object: " 的发布副本" };
const MD_VIEW_KEY = "series.files.md";
/** Transparent pixels show as a quiet checkerboard. */
const CHECKER = {
  backgroundImage: "conic-gradient(rgb(128 128 128 / 0.1) 25%, transparent 0 50%, rgb(128 128 128 / 0.1) 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

function rowId(path: string): string {
  return `series-file-${encodeURIComponent(path).replace(/%/g, "_")}`;
}

/** Markdown is read formatted unless the user asked for the source. */
function readMdView(): "source" | "preview" {
  try { return localStorage.getItem(MD_VIEW_KEY) === "source" ? "source" : "preview"; } catch { return "preview"; }
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark className="rounded-sm bg-primary/25 text-heading">{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

/**
 * 文件系统视图：项目目录在磁盘上的原样——每一版的文件、素材、账本、对象库、锁，全都列出来。
 * 左边是目录树（↑↓ 浏览、←→ 折叠展开、/ 筛选），右边是选中文件的原文或预览；
 * 属于某一版产出物的文件可以一键回到结构化视图，任何文件都能拖进对话。
 */
export function FilesView({ api, status, refreshKey, path, onPath, reveal, wide, onRef, onStructured }: Props) {
  const pid = status.project_id;
  const [tree, setTree] = useState<FileTree | null>(null);
  const [treeError, setTreeError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(path);
  const [focused, setFocused] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const scrollTo = useRef("");
  const expandedNow = useRef(expanded);
  expandedNow.current = expanded;
  const seeded = useRef("");

  useEffect(() => { setTree(null); setTreeError(""); setQuery(""); }, [pid]);
  useEffect(() => {
    let alive = true;
    api.files(pid)
      .then(t => { if (alive) { setTree(t); setTreeError(""); } })
      .catch(e => { if (alive) setTreeError(apiErrorMessage(e, "读取文件列表失败")); });
    return () => { alive = false; };
  }, [api, pid, refreshKey]);

  const root = useMemo(() => (tree && tree.project_id === pid ? buildTree(tree.entries) : null), [tree, pid]);
  const rows = useMemo(() => (root ? visibleRows(root, expanded, query) : []), [root, expanded, query]);
  const node = root && path ? findNode(root, path) : null;

  // First look at a project: open the top-level folders (not the ledger) and the way to the picked file.
  useEffect(() => {
    if (!root || seeded.current === pid) return;
    seeded.current = pid;
    const top = visibleRows(root, new Set()).filter(r => r.node.dir && !r.node.hidden).map(r => r.node.path);
    setExpanded(new Set([...top, ...ancestors(path)]));
    scrollTo.current = path;
  }, [root, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((paths: string[]) => {
    setExpanded(prev => (paths.every(p => prev.has(p)) ? prev : new Set([...prev, ...paths])));
  }, []);

  // The picked file changed from outside (a chat ref, the structured view): show it.
  useEffect(() => {
    if (!path) return;
    open(ancestors(path));
    setCursor(path);
    scrollTo.current = path;
  }, [path, open]);

  // A folder from the breadcrumb: open the way to it and put the cursor on its row (a folded chain's, maybe).
  useEffect(() => {
    if (!reveal || !root) return;
    const next = new Set([...expandedNow.current, ...ancestors(reveal.path), reveal.path]);
    setExpanded(next);
    setQuery("");
    const target = rowOf(visibleRows(root, next), reveal.path)?.node.path || reveal.path;
    setCursor(target);
    scrollTo.current = target;
    list.current?.focus({ preventScroll: true });
  }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!scrollTo.current || !list.current) return;
    const el = list.current.querySelector<HTMLElement>(`[data-path="${CSS.escape(scrollTo.current)}"]`);
    if (el) { el.scrollIntoView({ block: "nearest" }); scrollTo.current = ""; }
  });

  // "/" jumps to the filter (not while typing anywhere).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "/" || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const toggle = (dir: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(dir)) next.delete(dir); else next.add(dir);
    return next;
  });

  const moveTo = (target: FileNode) => {
    setCursor(target.path);
    scrollTo.current = target.path;
    if (!target.dir) onPath(target.path);
  };

  const onTreeKey = (e: React.KeyboardEvent) => {
    if (!rows.length || e.metaKey || e.ctrlKey || e.altKey) return;
    const at = rows.findIndex(r => r.node.path === cursor);
    const here = at >= 0 ? rows[at].node : null;
    const go = (i: number) => moveTo(rows[Math.min(Math.max(i, 0), rows.length - 1)].node);
    const isOpen = (n: FileNode) => Boolean(query.trim()) || expanded.has(n.path);
    switch (e.key) {
      case "ArrowDown": go(at < 0 ? 0 : at + 1); break;
      case "ArrowUp": go(at < 0 ? 0 : at - 1); break;
      case "Home": go(0); break;
      case "End": go(rows.length - 1); break;
      case "ArrowRight":
        if (!here?.dir) return;
        if (!isOpen(here)) toggle(here.path); else if (here.children.length) go(at + 1);
        break;
      case "ArrowLeft": {
        if (!here) return;
        if (here.dir && isOpen(here) && !query.trim()) { toggle(here.path); break; }
        const up = rows.slice(0, at).reverse().find(r => r.depth < rows[at].depth);
        if (up) moveTo(up.node);
        break;
      }
      case "Enter":
      case " ":
        if (!here) return;
        if (here.dir) toggle(here.path); else onPath(here.path);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) { e.preventDefault(); e.stopPropagation(); setQuery(""); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter") {
      const first = rows.find(r => !r.node.dir);
      if (!first) return;
      e.preventDefault();
      moveTo(first.node);
      list.current?.focus({ preventScroll: true });
    }
  };

  const chatRefOf = useCallback((filePath: string, owner?: FileOwner): ChatRef => {
    if (owner && owner.role !== "media") return { ref: owner.ref, label: refLabel(status, owner.ref), project_id: pid };
    return { ref: filePath, label: owner ? `${refLabel(status, owner.ref)} · ${baseName(filePath)}` : baseName(filePath), project_id: pid };
  }, [status, pid]);

  if (treeError && !tree) return <p className="p-6 text-sm text-fusion">{treeError}</p>;
  if (!root || !tree) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted"><LoaderCircle size={16} aria-hidden className="me-2 animate-spin" />读取目录…</div>;
  }

  const showTree = wide || !path;
  const showPreview = wide || Boolean(path);
  const filtering = Boolean(query.trim());

  return (
    <div className="flex min-h-0 flex-1">
      {showTree && (
        <aside aria-label="目录" className={`flex min-h-0 flex-col ${wide ? "w-[17rem] shrink-0 border-e border-border-solid" : "flex-1"}`}>
          <div className="flex shrink-0 items-center gap-1 border-b border-border-solid p-1.5">
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-surface-2/70 px-2 py-1 text-muted ring-1 ring-transparent transition-shadow focus-within:ring-primary/40">
              <Search size={13} aria-hidden className="shrink-0" />
              <input ref={search} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onSearchKey}
                placeholder="筛选文件" aria-label="筛选文件" spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-xs text-heading outline-none placeholder:text-dim" />
              {query
                ? <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="清除筛选" className="shrink-0 rounded text-dim hover:text-heading"><X size={12} aria-hidden /></button>
                : <kbd className="shrink-0 rounded border border-border-solid px-1 font-sans text-[10px] leading-4 text-dim">/</kbd>}
            </label>
            <button type="button" onClick={() => setExpanded(new Set())} disabled={filtering || !expanded.size} title="全部折叠" aria-label="全部折叠"
              className="shrink-0 rounded-md p-1.5 text-dim transition-colors hover:bg-surface-2 hover:text-heading disabled:pointer-events-none disabled:opacity-30">
              <ChevronsDownUp size={14} aria-hidden />
            </button>
          </div>

          <div ref={list} role="tree" aria-label={`${tree.root} 的文件`} tabIndex={0}
            aria-activedescendant={cursor && rows.some(r => r.node.path === cursor) ? rowId(cursor) : undefined}
            onKeyDown={onTreeKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            className="min-h-0 flex-1 overflow-y-auto py-1 outline-none">
            {!rows.length && (
              <p className="px-4 py-6 text-center text-xs text-muted">{filtering ? `没有名字里带「${query.trim()}」的文件` : "目录是空的"}</p>
            )}
            {rows.map(({ node: n, depth, label }) => (
              <TreeRow key={n.path} node={n} depth={depth} label={label} query={query}
                open={filtering || expanded.has(n.path)} active={!n.dir && n.path === path} cursor={focused && n.path === cursor}
                onClick={() => {
                  setCursor(n.path);
                  if (n.dir) toggle(n.path); else onPath(n.path);
                }}
                chatRef={n.dir ? undefined : chatRefOf(n.path, n.entry?.owner)} />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border-solid px-3 py-1.5 text-[11px] text-dim" title={tree.root}>
            <span className="tabular-nums">{tree.files} 个文件 · {sizeLabel(tree.bytes)}</span>
            {tree.truncated && <span className="text-spark-flare">· 只列出了前 {tree.entries.length} 项</span>}
          </div>
        </aside>
      )}

      {showPreview && (
        path
          ? <Preview key={pid} api={api} pid={pid} path={path} node={node} root={tree.root} refreshKey={refreshKey} status={status}
              wide={wide} onBack={() => onPath("")} onRef={onRef} onStructured={onStructured} chatRef={chatRefOf} />
          : <Overview tree={tree} />
      )}
    </div>
  );
}

function TreeRow({ node, depth, label, query, open, active, cursor, onClick, chatRef }: {
  node: FileNode;
  depth: number;
  label: string;
  query: string;
  open: boolean;
  active: boolean;
  cursor: boolean;
  onClick: () => void;
  chatRef?: ChatRef;
}) {
  const owner = node.entry?.owner;
  const [stem, tail] = node.dir ? [label, ""] : splitName(node.name);
  const Icon = node.dir ? (open ? FolderOpen : Folder) : TYPE_ICON[fileType(node.path, owner)];
  const about = aboutPath(node.path);
  return (
    <div id={rowId(node.path)} role="treeitem" aria-level={depth + 1} aria-selected={active}
      aria-expanded={node.dir ? open : undefined} data-path={node.path}
      draggable={Boolean(chatRef)} onDragStart={chatRef ? e => dragRef(e, chatRef) : undefined}
      onClick={onClick}
      title={[node.path, about, chatRef ? "拖到对话 = 引用" : ""].filter(Boolean).join("\n")}
      style={{ paddingInlineStart: 6 + depth * 14 }}
      className={`group/row relative flex h-7 cursor-pointer select-none items-center gap-1 pe-2 text-[13px] transition-colors
        ${active ? "bg-primary/10 text-heading" : "text-body hover:bg-surface-2/80"}
        ${cursor ? "outline outline-1 -outline-offset-1 outline-primary/50" : ""}`}>
      {Array.from({ length: depth }, (_, d) => (
        <span key={d} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border-solid/70" style={{ insetInlineStart: 13 + d * 14 }} />
      ))}
      {active && <span aria-hidden className="absolute inset-y-1 start-0 w-0.5 rounded-full bg-primary" />}
      {node.dir
        ? <ChevronRight size={13} aria-hidden className={`shrink-0 text-dim transition-transform duration-150 rtl:-scale-x-100 ${open ? "rotate-90 rtl:-rotate-90" : ""}`} />
        : <span aria-hidden className="w-[13px] shrink-0" />}
      <Icon size={14} aria-hidden className={`shrink-0 ${node.dir ? "text-primary/70" : active ? "text-primary" : "text-dim"}`} />
      {/* a long name gives up its middle, never the version: `concept-charac….v001.png` */}
      <span className={`flex min-w-0 flex-1 ps-0.5 ${node.hidden ? "text-muted" : ""}`}>
        <span className="truncate"><Highlight text={stem} query={query} /></span>
        <span className="shrink-0 text-dim"><Highlight text={tail} query={query} /></span>
      </span>
      {node.dir
        ? <span className="shrink-0 text-[10px] tabular-nums text-dim opacity-0 transition-opacity group-hover/row:opacity-100">{node.files}</span>
        : <span className="hidden shrink-0 text-[10px] tabular-nums text-dim group-hover/row:inline">{sizeLabel(node.entry?.size)}</span>}
      {owner && <StatusDot tone={toneOf(owner.status)} className={owner.role === "text" ? "" : "opacity-40"} />}
    </div>
  );
}

function Overview({ tree }: { tree: FileTree }) {
  const hint: [string, string][] = [["↑ ↓", "浏览"], ["← →", "折叠 / 展开"], ["/", "筛选"]];
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <FolderTree size={30} aria-hidden className="text-dim" />
      <div>
        <p className="text-sm text-heading">{tree.files} 个文件 · {sizeLabel(tree.bytes)}</p>
        <p dir="ltr" className="mt-1 break-all font-mono text-[11px] text-dim">{tree.root}/</p>
      </div>
      <p className="max-w-xs text-xs text-muted">这是项目目录在磁盘上的原样。选一个文件，看看里面到底写了什么。</p>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-dim">
        {hint.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border-solid px-1 font-sans text-[10px] leading-4">{k}</kbd>{v}
          </span>
        ))}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const cls = "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-heading";
  return href
    ? <a href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} className={cls}>{children}</a>
    : <button type="button" onClick={onClick} title={label} aria-label={label} className={cls}>{children}</button>;
}

function Preview({ api, pid, path, node, root, refreshKey, status, wide, onBack, onRef, onStructured, chatRef }: {
  api: SeriesApi;
  pid: string;
  path: string;
  node: FileNode | null;
  root: string;
  refreshKey: number;
  status: ProjectStatus;
  wide: boolean;
  onBack: () => void;
  onRef: (ref: ChatRef) => void;
  onStructured: (ref: string) => void;
  chatRef: (path: string, owner?: FileOwner) => ChatRef;
}) {
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mdView, setMdView] = useState(readMdView);
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.file(pid, path)
      .then(f => { if (alive) { setFile(f); setError(""); } })
      .catch(e => { if (alive) { setFile(null); setError(apiErrorMessage(e, "读取文件失败")); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, pid, path, refreshKey]);
  useEffect(() => { setSize(null); setCopied(false); }, [path]);

  const entry = node?.entry;
  const owner = entry?.owner || (file?.path === path ? file.owner : undefined);
  const type = fileType(path, owner);
  const name = baseName(path);
  const [stem, tail] = splitName(name);
  const Icon = TYPE_ICON[type];
  const about = aboutPath(path);
  const current = file && file.path === path ? file : null;
  const stale = Boolean(file && !current);
  const src = current ? api.mediaSrc(current.url) : "";

  const setView = (v: "source" | "preview") => {
    setMdView(v);
    try { localStorage.setItem(MD_VIEW_KEY, v); } catch { /* private mode */ }
  };
  const copy = () => {
    void navigator.clipboard?.writeText(`${root}/${path}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  };

  const meta = [sizeLabel(entry?.size ?? current?.size), timeLabel(entry?.mtime ?? current?.mtime), size ? `${size.w}×${size.h}` : ""].filter(Boolean);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-solid px-3 py-2">
        {!wide && (
          <button type="button" onClick={onBack} aria-label="回到目录" className="-ms-1 shrink-0 rounded-md p-1 text-muted hover:text-primary">
            <ArrowLeft size={15} aria-hidden className="rtl:-scale-x-100" />
          </button>
        )}
        <Icon size={18} aria-hidden className="shrink-0 text-primary/80" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-heading" title={path}>{stem}<span className="text-dim">{tail}</span></div>
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums text-dim">
            <span className="shrink-0">{meta.join(" · ")}</span>
            {owner && (
              <button type="button" onClick={() => onStructured(owner.ref)} title="在结构化视图里看这一版"
                className="group/owner inline-flex min-w-0 items-center gap-1 rounded-full border border-border-solid px-1.5 leading-4 text-muted transition-colors hover:border-primary/50 hover:text-primary">
                <StatusDot tone={toneOf(owner.status)} />
                <span className="truncate">{refLabel(status, owner.ref)}{ROLE_TEXT[owner.role]}</span>
                <LayoutGrid size={10} aria-hidden className="shrink-0 opacity-60 group-hover/owner:opacity-100" />
              </button>
            )}
          </div>
        </div>
        {loading && <LoaderCircle size={14} aria-hidden className="shrink-0 animate-spin text-dim" />}
        {type === "markdown" && current?.text != null && (
          <div role="radiogroup" aria-label="Markdown 显示" className="flex shrink-0 rounded-md border border-border-solid p-0.5 text-[11px]">
            {(["preview", "source"] as const).map(v => (
              <button key={v} type="button" role="radio" aria-checked={mdView === v} onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 transition-colors ${mdView === v ? "bg-surface-3 text-heading" : "text-muted hover:text-heading"}`}>
                {v === "source" ? "源码" : "预览"}
              </button>
            ))}
          </div>
        )}
        <div className="flex shrink-0 items-center">
          <IconButton label="引用到对话" onClick={() => onRef(chatRef(path, owner))}><MessageSquarePlus size={15} aria-hidden /></IconButton>
          <IconButton label={copied ? "已复制路径" : "复制路径"} onClick={copy}>
            {copied ? <Check size={15} aria-hidden className="text-spark-mint" /> : <Copy size={15} aria-hidden />}
          </IconButton>
          {current && <IconButton label="打开原文件" href={src}><ExternalLink size={15} aria-hidden /></IconButton>}
        </div>
      </div>
      {about && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border-solid bg-surface-2/40 px-3 py-1.5 text-[11px] text-muted">
          <Info size={12} aria-hidden className="shrink-0 text-dim" />{about}
        </div>
      )}

      <div className={`relative flex min-h-0 flex-1 flex-col transition-opacity ${stale ? "opacity-50" : ""}`}>
        {error && !current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm text-heading">{error}</p>
            <p className="text-xs text-muted">文件可能刚被移走或改名了。</p>
          </div>
        ) : !file ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted"><LoaderCircle size={16} aria-hidden className="me-2 animate-spin" />读取中…</div>
        ) : (
          <Body file={file} type={fileType(file.path, file.owner)} mdView={mdView} src={api.mediaSrc(file.url)} onSize={setSize}
            status={status} onOpen={onStructured} />
        )}
      </div>
    </div>
  );
}

function Body({ file, type, mdView, src, onSize, status, onOpen }: {
  file: FileContent;
  type: FileType;
  mdView: "source" | "preview";
  src: string;
  onSize: (size: { w: number; h: number }) => void;
  status: ProjectStatus;
  /** a ref in the text (dependencies, the log, the threads ledger) */
  onOpen: (ref: string) => void;
}) {
  if (type === "image") {
    return (
      <div style={CHECKER} className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <img src={src} alt={baseName(file.path)} onLoad={e => onSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
      </div>
    );
  }
  if (type === "video") {
    return <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-6"><video key={src} src={src} controls preload="metadata" className="max-h-full max-w-full rounded-md" /></div>;
  }
  if (type === "audio") return <div className="flex flex-1 items-center justify-center p-8"><audio key={src} src={src} controls className="w-full max-w-md" /></div>;
  if (type === "pdf") return <iframe title={baseName(file.path)} src={src} className="h-full w-full flex-1 border-0" />;
  if (file.text == null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <File size={30} aria-hidden className="text-dim" />
        <p className="text-sm text-heading">{file.binary ? "二进制文件，没法直接显示" : "这种文件没法直接预览"}</p>
        <a href={src} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-solid px-3 py-1.5 text-xs text-body transition-colors hover:border-primary hover:text-primary">
          <ExternalLink size={12} aria-hidden />打开原文件
        </a>
      </div>
    );
  }
  const cut = file.truncated && (
    <p className="shrink-0 border-t border-border-solid px-3 py-1.5 text-center text-[11px] text-spark-flare">文件太大，只显示了开头一部分；完整内容点右上角「打开原文件」</p>
  );
  if (type === "markdown" && mdView === "preview") {
    // The project notes have a fixed shape: lay them out by it (the ledger as a table, the log as a timeline…).
    const note = file.owner ? null : noteOf(file.path);
    if (note) {
      return (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto"><NotePreview id={note} text={file.text} status={status} onOpen={onOpen} /></div>
          {cut}
        </>
      );
    }
    const [fields, body] = splitFrontmatter(file.text);
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-3xl px-6 py-5 text-body">
            {fields && <FieldsCard yaml={fields} status={status} onOpen={onOpen} className="mb-5" />}
            <MdBody text={body} />
          </article>
        </div>
        {cut}
      </>
    );
  }
  // The object store keeps markdown without an extension: give the editor a name it can colour.
  const editorPath = file.owner?.role === "object" ? `${file.path}.md` : file.path;
  return (
    <>
      <div className="min-h-0 flex-1"><SourceEditorPane value={file.text} path={editorPath} /></div>
      {cut}
    </>
  );
}
