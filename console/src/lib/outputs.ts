import { api } from "./api";
import type { WorkspaceScope } from "./workspaceScope";

/** Empty in dev (same-origin proxy). Production Console is on Amplify, API is api.mega-x.ai. */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/$/, "");

function withApiBase(path: string): string {
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}

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
  return (await fetchListPage(scope, query)).items;
}

export type OutputListPage = { items: OutputFile[]; has_more: boolean; offset?: number };

export async function fetchListPage(scope: WorkspaceScope, query: Record<string, string | number | undefined> = {}): Promise<OutputListPage> {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") q.set(key, String(value));
  }
  const res = await api.get<OutputListPage>(`${scope.base}/outputs/list?${q}`);
  return { ...res, items: res.items || [], has_more: !!res.has_more };
}

export type OutputMention = { value: string; match: "name" | "path" };
export type ResolvedMention = OutputMention & {
  status: "resolved" | "ambiguous" | "missing" | "invalid";
  candidates: OutputFile[];
  code?: string;
};

export async function resolveOutputs(scope: WorkspaceScope, items: OutputMention[]): Promise<ResolvedMention[]> {
  const result: ResolvedMention[] = [];
  for (let i = 0; i < items.length; i += 32) {
    const batch = await api.post<{ items: ResolvedMention[] }>(`${scope.base}/outputs/resolve`, { items: items.slice(i, i + 32) });
    result.push(...batch.items);
  }
  return result;
}

export async function fetchMeta(scope: WorkspaceScope, path: string): Promise<OutputMeta> {
  return api.get<OutputMeta>(`${scope.base}/outputs/meta?path=${encodeURIComponent(path)}`);
}

export function rawUrl(scope: WorkspaceScope, path: string, download = false): string {
  return withApiBase(`${scope.base}/outputs/raw?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`);
}

export async function requestPreviewUrl(scope: WorkspaceScope, path: string): Promise<string> {
  const res = await api.post<{ url: string }>(`${scope.base}/outputs/preview-url`, { path });
  return withApiBase(res.url);
}

export async function fetchKinds(scope: WorkspaceScope): Promise<Record<string, string>> {
  const res = await api.get<{ kinds: Record<string, string> }>(`${scope.base}/outputs/kinds`);
  return res.kinds || {};
}
