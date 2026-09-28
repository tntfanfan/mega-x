import { api } from "./api";
import type { WorkspaceScope } from "./workspaceScope";

export type OutputKind =
  | "markdown" | "text" | "code" | "json" | "yaml" | "table"
  | "image" | "video" | "audio" | "pdf" | "html"
  | "slides" | "doc" | "sheet" | "other" | "dir";

export type OutputFile = {
  path: string;
  name: string;
  kind: OutputKind | string;
  size?: number;
  mtime?: number;
  dept_id?: string | null;
  task_id?: string | null;
  run_id?: string | null;
  step_key?: string | null;
  source?: string | null;
  oversize?: boolean;
  label?: string;
};

export type OutputNode = OutputFile & {
  label: string;
  children?: OutputNode[];
};

export type OutputMeta = OutputFile & {
  preview: "ready" | "pending" | "failed" | "none";
  preview_path?: string;
};

export async function fetchTree(scope: WorkspaceScope, prefix = "", depth = 3): Promise<OutputNode[]> {
  const q = new URLSearchParams({ prefix, depth: String(depth) });
  const res = await api.get<{ nodes: OutputNode[] }>(`${scope.base}/outputs/tree?${q}`);
  return res.nodes || [];
}

export async function fetchList(scope: WorkspaceScope, query: Record<string, string | number | undefined> = {}): Promise<OutputFile[]> {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") q.set(key, String(value));
  }
  const res = await api.get<{ items: OutputFile[] }>(`${scope.base}/outputs/list?${q}`);
  return res.items || [];
}

export async function fetchMeta(scope: WorkspaceScope, path: string): Promise<OutputMeta> {
  return api.get<OutputMeta>(`${scope.base}/outputs/meta?path=${encodeURIComponent(path)}`);
}

export function rawUrl(scope: WorkspaceScope, path: string, download = false): string {
  return `${scope.base}/outputs/raw?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

export async function requestPreviewUrl(scope: WorkspaceScope, path: string): Promise<string> {
  const res = await api.post<{ url: string }>(`${scope.base}/outputs/preview-url`, { path });
  return res.url;
}

export async function fetchKinds(scope: WorkspaceScope): Promise<Record<string, string>> {
  const res = await api.get<{ kinds: Record<string, string> }>(`${scope.base}/outputs/kinds`);
  return res.kinds || {};
}
