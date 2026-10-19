/** 部门应用（档案里声明了 `app` 的部门）：侧栏页签、默认聊天里的过滤。 */

import { useEffect, useState } from "react";
import { api, type DeptCatalogItem } from "./api";
import type { WorkspaceScope } from "./workspaceScope";

export function isAppDept(dept: Pick<DeptCatalogItem, "profile">): boolean {
  return Boolean(dept.profile?.app?.id);
}

export function deptAppBase(scope: WorkspaceScope, deptId: string): string {
  return `${scope.base}/apps/${encodeURIComponent(deptId)}`;
}

/** 已安装的部门卡片；`deptIds` 变了（装 / 卸部门）就重新拉。 */
export function useInstalledDepts(scope: WorkspaceScope, deptIds: string[]) {
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const key = deptIds.join(",");
  useEffect(() => {
    let alive = true;
    setError(null);
    api.get<{ items: DeptCatalogItem[] }>(`${scope.base}/depts`)
      .then(r => { if (alive) setDepts(r.items || []); })
      .catch(e => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [scope.base, key, attempt]);
  return { depts, appDepts: depts.filter(isAppDept), loaded, error, retry: () => setAttempt(n => n + 1) };
}
