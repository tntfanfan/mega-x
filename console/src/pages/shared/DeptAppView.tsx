/**
 * 部门应用的界面主体，由「聊天」页（TenantChatView）在选中一个声明了 `app` 的部门
 * 时渲染在部门栏下面；c/:companyId/apps/:deptId 和 l/:lineId/apps/:deptId 只是
 * 跳回 `chat?dept=` 的旧链接。
 *
 * deptId → 部门卡片的 `profile.app.id` → 从注册表懒加载应用页面。
 * 先探一次 `${appBase}/health`：应用进程没起来（503）时统一显示「部门应用尚未
 * 启动 / 正在重启」，自动重试；起来之后断线由应用自己处理。
 */

import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from "react";
import { Navigate, useOutletContext, useParams } from "react-router-dom";

import { DEPT_APPS, type DeptAppProps } from "../../apps/registry";
import { ApiError, api, apiErrorMessage, type Company } from "../../lib/api";
import { deptAppBase, useInstalledDepts } from "../../lib/deptApps";
import { resolveDeptDisplay } from "../../lib/depts";
import { companyScope, lineScope } from "../../lib/workspaceScope";
import { WorkspaceAvailabilityGate } from "../../components/ui/WorkspaceAvailabilityGate";

const RETRY_MS = 5000;

type Probe = { kind: "checking" } | { kind: "up" } | { kind: "down"; status: number; message: string };

const loaded: Record<string, ComponentType<DeptAppProps>> = {};

function appComponent(appId: string): ComponentType<DeptAppProps> | null {
  const load = DEPT_APPS[appId];
  if (!load) return null;
  loaded[appId] ||= lazy(load);
  return loaded[appId];
}

/** Old `apps/:deptId` links → the chat page with that dept selected. */
export function DeptAppRedirect() {
  const { companyId, lineId, deptId = "" } = useParams<{ companyId?: string; lineId?: string; deptId: string }>();
  const scope = companyId ? companyScope(companyId) : lineScope(lineId || "");
  return <Navigate to={`${scope.routeBase}/chat?dept=${encodeURIComponent(deptId)}`} replace />;
}

export default function DeptAppView({ deptId }: { deptId: string }) {
  const { companyId, lineId } = useParams<{ companyId?: string; lineId?: string }>();
  const outlet = useOutletContext<{ company?: Company; line?: Company }>();
  const tenant = (companyId ? outlet.company : outlet.line) as Company;
  const scope = useMemo(() => companyId ? companyScope(companyId) : lineScope(lineId || ""), [companyId, lineId]);
  const { depts, loaded: deptsLoaded, error, retry } = useInstalledDepts(scope, tenant.dept_ids);
  const dept = depts.find(d => d.id === deptId);
  const appId = dept?.profile?.app?.id || "";
  const appBase = deptAppBase(scope, deptId);
  const App = appId ? appComponent(appId) : null;
  const [probe, setProbe] = useState<Probe>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!App || tenant.state !== "running") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    api.get(`${appBase}/health`).then(() => { if (alive) setProbe({ kind: "up" }); }).catch(e => {
      if (!alive) return;
      const status = e instanceof ApiError ? e.status : 0;
      setProbe({ kind: "down", status, message: apiErrorMessage(e, "部门应用暂时连不上") });
      if (status !== 404 && status !== 403) timer = setTimeout(() => setAttempt(n => n + 1), RETRY_MS);
    });
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [App, appBase, tenant.state, attempt]);

  if (!deptsLoaded) return <p className="p-6 text-sm text-muted">加载中…</p>;
  if (error) return <Notice title="加载部门失败" detail={apiErrorMessage(error)} onRetry={retry} />;
  if (!dept) return <Notice title="没有这个部门" detail={`${deptId} 没有安装在这里。`} />;
  if (!App) {
    return <Notice title={`${resolveDeptDisplay(dept.id, depts).name} 没有专属界面`}
      detail={`这个控制台版本还不认识部门应用「${appId}」，请刷新页面。`} onRetry={() => window.location.reload()} />;
  }

  const name = resolveDeptDisplay(dept.id, depts).name;
  const ready = tenant.state === "running" && probe.kind === "up";
  const title = tenant.state !== "running"
    ? (tenant.state === "provisioning" ? "工作区正在启动" : tenant.state === "paused" ? "工作区已暂停" : "工作区出错了")
    : probe.kind !== "down" ? `正在连接${name}`
      : probe.status === 503 ? "部门应用尚未启动 / 正在重启"
        : probe.status === 404 ? "这个部门没有专属界面" : "部门应用暂时连不上";
  const detail = tenant.state !== "running" ? "工作区就绪后会自动连接。"
    : probe.kind === "down" ? (probe.status === 503 ? `${name}的应用进程还没有就绪，几秒后自动重试。` : probe.message)
      : "正在检查部门应用。";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkspaceAvailabilityGate ready={ready} title={title} detail={detail}
        waiting={tenant.state === "provisioning" || probe.kind === "checking" || (probe.kind === "down" && probe.status === 503)}
        attempt={attempt + 1} onRetry={probe.kind === "down" ? () => setAttempt(n => n + 1) : undefined}>
        {ready ? (
          <Suspense fallback={<p className="p-6 text-sm text-muted">加载界面…</p>}>
            <App key={`${scope.base}:${dept.id}`} scope={scope} dept={dept} tenant={tenant} appBase={appBase} />
          </Suspense>
        ) : <div className="flex-1" />}
      </WorkspaceAvailabilityGate>
    </div>
  );
}

function Notice({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-lg font-medium text-heading">{title}</p>
      <p className="mt-3 text-sm leading-6 text-muted">{detail}</p>
      <div className="mt-5 flex justify-center gap-4 text-sm">
        {onRetry && <button type="button" onClick={onRetry} className="text-primary hover:underline">重试</button>}
      </div>
    </div>
  );
}
