import { api } from "./api";
import type { WorkspaceScope } from "./workspaceScope";

export type DeptStatusItem = {
  dept_id: string;
  state: "error" | "running" | "planning" | "chatting" | "queued" | "idle" | string;
  label: string;
  task_id?: string;
  run_id?: string;
  since?: string;
  extra?: number;
};

export async function fetchDeptStatus(scope: WorkspaceScope): Promise<DeptStatusItem[]> {
  const res = await api.get<{ items: DeptStatusItem[] }>(`${scope.base}/depts/status`);
  return res.items || [];
}
