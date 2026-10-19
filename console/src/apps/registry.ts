/**
 * 部门应用注册表：`profile.app.id` → 应用页面（按应用分包懒加载）。
 *
 * 一个部门应用 = 租户容器里的一个后端进程（`platform/apps/<id>/`）+ 这里的一个
 * 页面。页面的 HTTP / WS 都以 `appBase` 为前缀，经 API → Runtime 转发到应用；
 * 协议、界面都由应用自己决定。要用控制台现有组件可以直接 import，要改就复制到
 * 应用目录里再改，不改原文件。
 */

import type { ComponentType } from "react";
import type { Company, DeptCatalogItem } from "../lib/api";
import type { WorkspaceScope } from "../lib/workspaceScope";

export type DeptAppProps = {
  /** scope.base = /v1/companies/{id} 或 /v1/lines/{id} */
  scope: WorkspaceScope;
  dept: DeptCatalogItem;
  /** 状态（running / provisioning / paused）由应用自己决定怎么展示 */
  tenant: Company;
  /** `${scope.base}/apps/${dept.id}`：应用的 HTTP / WS 都以它为前缀 */
  appBase: string;
};

export type DeptAppModule = { default: ComponentType<DeptAppProps> };

export const DEPT_APPS: Record<string, () => Promise<DeptAppModule>> = {
  series: () => import("./series"),
};
