import { useCallback, useState } from "react";
import { fetchDeptStatus, type DeptStatusItem } from "../lib/deptStatus";
import type { WorkspaceScope } from "../lib/workspaceScope";
import { usePoll } from "./usePoll";

export function useDeptStatus(scope: WorkspaceScope | null) {
  const [items, setItems] = useState<DeptStatusItem[]>([]);
  const load = useCallback(() => {
    if (!scope) return;
    fetchDeptStatus(scope).then(setItems).catch(() => {});
  }, [scope]);
  usePoll(load, 5000, 5000, true);
  const byId = new Map(items.map((item) => [item.dept_id, item]));
  return { items, byId, reload: load };
}
