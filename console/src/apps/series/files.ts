/**
 * 文件视图的纯逻辑：把平铺的目录条目拼成树、算出当前可见的行（展开 / 筛选）、认文件类型。
 * 只用 type import，测试可以直接用 node 跑。
 */

import type { FileEntry, FileOwner } from "./api";

export type FileNode = {
  path: string;
  name: string;
  dir: boolean;
  hidden: boolean;
  entry?: FileEntry;
  children: FileNode[];
  /** files anywhere below (dirs) */
  files: number;
};

/** `label` = the folder chain a row stands for (`characters/keeper/a`) when single folders are folded together. */
export type Row = { node: FileNode; depth: number; label: string };

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

function order(a: FileNode, b: FileNode): number {
  if (a.dir !== b.dir) return a.dir ? -1 : 1;
  if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
  return collator.compare(a.name, b.name);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `a/b/c.md` → `["a", "a/b"]` */
export function ancestors(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** `story/outline.v002.md@v2` → `story/outline.v002.md` */
export function pathOfRef(ref: string): string {
  return ref.replace(/@v\d+$/, "");
}

/** A ref or path as the files view names it: project-relative (absolute media paths cut at the project). */
export function projectPath(ref: string, projectId: string): string {
  const path = pathOfRef(ref.trim());
  const at = path.indexOf(`/${projectId}/`);
  return path.startsWith("/") && projectId && at >= 0 ? path.slice(at + projectId.length + 2) : path.replace(/^\.?\//, "");
}

export function buildTree(entries: FileEntry[]): FileNode {
  const root: FileNode = { path: "", name: "", dir: true, hidden: false, children: [], files: 0 };
  const nodes = new Map<string, FileNode>([["", root]]);
  const ensure = (path: string, dir: boolean, entry?: FileEntry): FileNode => {
    let node = nodes.get(path);
    if (!node) {
      const name = baseName(path);
      node = { path, name, dir, hidden: name.startsWith("."), children: [], files: 0 };
      nodes.set(path, node);
      const slash = path.lastIndexOf("/");
      ensure(slash >= 0 ? path.slice(0, slash) : "", true).children.push(node);
    }
    if (entry) node.entry = entry;
    return node;
  };
  for (const entry of entries) ensure(entry.path, Boolean(entry.dir), entry);
  const finish = (node: FileNode): number => {
    node.children.sort(order);
    node.files = node.children.reduce((n, c) => n + (c.dir ? finish(c) : 1), 0);
    return node.files;
  };
  finish(root);
  return root;
}

export function findNode(root: FileNode, path: string): FileNode | null {
  if (!path) return root;
  let node: FileNode | undefined = root;
  for (const part of path.split("/")) {
    node = node.children.find(c => c.name === part);
    if (!node) return null;
  }
  return node;
}

/**
 * The rows the tree shows. With a query, every file whose path contains it (and the folders on the way)
 * is shown expanded; without one, folders open only when they are in `expanded`. A folder whose only
 * child is a folder shares its row (`assets/characters/keeper` → one row, keyed by the deepest one).
 */
export function visibleRows(root: FileNode, expanded: ReadonlySet<string>, query = ""): Row[] {
  const q = query.trim().toLowerCase();
  const out: Row[] = [];
  const hits = (node: FileNode): boolean =>
    node.dir ? node.children.some(hits) : node.path.toLowerCase().includes(q);
  const walk = (node: FileNode, depth: number) => {
    for (const child of node.children) {
      if (q && !hits(child)) continue;
      let last = child;
      let label = child.name;
      while (last.dir && last.children.length === 1 && last.children[0].dir) {
        last = last.children[0];
        label += `/${last.name}`;
      }
      out.push({ node: last, depth, label });
      if (last.dir && (q || expanded.has(last.path))) walk(last, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** The row that shows `path`: its own, the folded chain it is part of, else the nearest one above it. */
export function rowOf(rows: Row[], path: string): Row | undefined {
  const depth = path.split("/").length;
  const own = rows.find(r => {
    const end = r.node.path.split("/").length;
    const start = end - r.label.split("/").length + 1;
    return (r.node.path === path || r.node.path.startsWith(`${path}/`)) && start <= depth && depth <= end;
  });
  const up = ancestors(path).pop();
  return own || (up ? rowOf(rows, up) : undefined);
}

/** `script-ep-001.v002.md` → `["script-ep-001", ".v002.md"]`: the version suffix reads quieter. */
export function splitName(name: string): [string, string] {
  const m = /^(.+?)(\.v\d{3,}(?:\.[^./]+)?)$/i.exec(name);
  if (m) return [m[1], m[2]];
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

export type FileType = "markdown" | "json" | "text" | "image" | "video" | "audio" | "pdf" | "other";

const EXT: Record<string, FileType> = {
  md: "markdown", markdown: "markdown",
  json: "json", jsonl: "json",
  txt: "text", yaml: "text", yml: "text", srt: "text", csv: "text", log: "text",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image",
  mp4: "video", webm: "video", mov: "video",
  mp3: "audio", wav: "audio", m4a: "audio",
  pdf: "pdf",
};

export function fileType(path: string, owner?: FileOwner): FileType {
  if (owner?.role === "object") return "markdown";
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? EXT[name.slice(dot + 1).toLowerCase()] || "other" : "other";
}

export function sizeLabel(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")} ${units[i]}`;
}

/** What a file or folder of the project is for: the layer underneath, in a sentence. */
const ABOUT: [RegExp, string][] = [
  [/^PROJECT\.md$/, "项目总览：定稿 / 过期清单由系统生成，其余是主创手写的"],
  [/^preferences\.md$/, "你的偏好，主创每次开工前都会读"],
  [/^log\.md$/, "决定流水：什么时候、谁、定了什么"],
  [/^story\/threads\.md$/, "伏笔台账，写任何一集之前读"],
  [/^\.project$/, "账本目录，系统自己维护，不要手改"],
  [/^\.project\/published\.jsonl$/, "发布账本：每发布一版追加一行"],
  [/^\.project\/status\.json$/, "每一版现在的状态：定稿 / 草稿 / 过期 / 弃用"],
  [/^\.project\/jobs\.jsonl$/, "出图、出视频这类异步任务的记录"],
  [/^\.project\/acknowledged\.json$/, "已经确认过的变化"],
  [/^\.project\/project\.json$/, "项目信息（标题）"],
  [/^\.project\/objects(\/|$)/, "每一版发布时的原样副本，按内容哈希存；磁盘上的文件被手改也不影响它"],
  [/^\.project\/versions(\/|$)/, "版本号预留，防止同时发布撞号"],
  [/^\.project\/seen(\/|$)/, "每个会话已经看过哪些变化"],
  [/^\.project\/lock$/, "写账本时的文件锁"],
];

export function aboutPath(path: string): string {
  return ABOUT.find(([re]) => re.test(path))?.[1] || "";
}
