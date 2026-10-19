/**
 * 「聊天」页签：顶上一条部门栏，列出所有已安装的部门；下面是选中部门自己的界面。
 *
 * - 普通部门 → 默认聊天（TenantWorkspace）。
 * - 部门应用（档案声明了 `app`）→ 应用自己的页面（DeptAppView → apps/registry）。
 * - 平台自带专属界面的部门（公司里的股票投研部）→ 投研工作台（ResearchChatPanel）。
 *
 * 选中的部门就是 `?dept=`；没带时用这个 shell 里上次打开的部门，再没有就用第一个。
 * 部门栏在两种界面之外，任何一边卡在「连接中 / 尚未启动」都还能切到别的部门。
 */

import { useEffect, useMemo } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { TenantWorkspace, useTenantChatSelection } from "../../components/chat/TenantWorkspace";
import type { Company, DeptCatalogItem } from "../../lib/api";
import { hasNativeView, hasOwnView, isAppDept, useInstalledDepts } from "../../lib/deptApps";
import { resolveDeptDisplay } from "../../lib/depts";
import { companyScope, lineScope, type WorkspaceScope } from "../../lib/workspaceScope";
import { ResearchChatPanel } from "../business/company/ResearchView";
import DeptAppView from "./DeptAppView";

export default function TenantChatView() {
  const { companyId, lineId } = useParams<{ companyId?: string; lineId?: string }>();
  const outlet = useOutletContext<{ company?: Company; line?: Company }>();
  const tenant = (companyId ? outlet.company : outlet.line) as Company;
  const scope = useMemo(() => companyId ? companyScope(companyId) : lineScope(lineId || ""), [companyId, lineId]);
  const { depts, loaded, error } = useInstalledDepts(scope, tenant.dept_ids);
  const { lastDept, busy } = useTenantChatSelection();
  const [params, setParams] = useSearchParams();

  const asked = params.get("dept") || "";
  const current = depts.find(d => d.id === asked) || depts.find(d => d.id === lastDept) || depts[0];

  // Pin the choice in the URL so the default chat (which reads ?dept=) and the bar agree.
  useEffect(() => {
    if (current && current.id !== asked) {
      setParams(p => { const next = new URLSearchParams(p); next.set("dept", current.id); return next; }, { replace: true });
    }
  }, [current?.id, asked]); // eslint-disable-line react-hooks/exhaustive-deps

  // The default chat refuses to switch mid-turn; an app keeps its own turn running when left.
  const locked = busy && !!current && !hasOwnView(scope, current);
  const choose = (deptId: string) => {
    if (locked || deptId === current?.id) return;
    // Session params belong to the dept being left (default chat: session, apps: their own).
    setParams(new URLSearchParams({ dept: deptId }));
  };

  if (!loaded) return <p className="p-6 text-sm text-muted">加载中…</p>;
  // 部门列表没拉到：默认聊天自己会报错、重试。
  if (error || !current) return <TenantWorkspace panel="chat" />;

  return (
    <div className="flex h-[calc(100dvh-8rem-72px)] min-h-0 min-w-0 flex-col">
      <DeptBar scope={scope} depts={depts} current={current.id} locked={locked} onChoose={choose} />
      {hasNativeView(scope, current.id)
        ? <ResearchChatPanel company={tenant} page={params.get("page")} />
        : isAppDept(current)
          ? <DeptAppView key={current.id} deptId={current.id} />
          : <TenantWorkspace panel="chat" embedded />}
    </div>
  );
}

function DeptBar({ scope, depts, current, locked, onChoose }: {
  scope: WorkspaceScope; depts: DeptCatalogItem[]; current: string; locked: boolean; onChoose: (deptId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label="部门" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-solid bg-surface/60 px-2 py-1.5">
      {depts.map(d => {
        const active = d.id === current;
        const { emoji, name } = resolveDeptDisplay(d.id, depts, t);
        const own = hasOwnView(scope, d);
        return (
          <button key={d.id} type="button" aria-current={active ? "page" : undefined}
            disabled={locked && !active} onClick={() => onChoose(d.id)}
            title={locked && !active ? "正在回复，等这一轮结束再切换部门" : own ? `${name}（专属界面）` : name}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              active ? "bg-primary/10 text-primary" : "text-body hover:bg-surface-2 hover:text-heading"}`}>
            <span aria-hidden>{emoji}</span>{name}
            {own && <span className="rounded border border-current px-1 text-[10px] leading-4 opacity-60">专属</span>}
          </button>
        );
      })}
    </nav>
  );
}
