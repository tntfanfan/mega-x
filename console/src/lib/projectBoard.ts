import { api } from "./api";
import type { WorkspaceScope } from "./workspaceScope";

export type BlockMeta = {
  id: string; type: string; title: string; status: string; version: number;
  parent?: string; scene?: string; family?: string; order?: number; duration?: number;
  size?: string; movement?: string; action?: string; file?: string;
  canon?: string | string[]; selected?: string; selected_keyframe?: string; selected_clip?: string;
  refs?: { role: string; id: string }[]; derived_from?: string[]; subjects?: string[];
  dialogue?: { speaker: string; line: string; start?: number }[]; trim_in?: number;
  video?: { plan?: string }; shot_ids?: string[];
  segments?: { shot: string; in: number; duration: number }[];
  stale_from?: string[]; edited_by_user?: string[]; locked?: boolean;
};
export type BoardBlock = { meta: BlockMeta; body: string; path: string };
export type BoardLayout = { nodes: Record<string, { x: number; y: number }>; groups?: Record<string, string[]> };
export type BoardSnapshot = {
  project: { slug: string; title: string; duration: number; aspect: string; stage: string; autonomy: string; budget: number };
  blocks: BoardBlock[]; layout: BoardLayout; spent: number; stale: string[]; errors: { path: string; error: string }[];
};
export async function listProjects(scope: WorkspaceScope): Promise<string[]> {
  return (await api.get<{ projects: string[] }>(`${scope.base}/board/projects`)).projects;
}
export function fetchBoard(scope: WorkspaceScope, slug: string): Promise<BoardSnapshot> {
  return api.get(`${scope.base}/board/${encodeURIComponent(slug)}`);
}
export function mutateBoard(scope: WorkspaceScope, slug: string, op: string, id?: string, args: Record<string, unknown> = {}) {
  return api.post(`${scope.base}/board/${encodeURIComponent(slug)}/mutate`, { op, id, args });
}
export function mediaPath(slug: string, block: BoardBlock) {
  const folder = block.path.slice(0, block.path.lastIndexOf("/") + 1);
  return `board/dept-film/projects/${slug}/${folder}${block.meta.file}`;
}
