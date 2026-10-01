import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";
import { TaskCreateFlow } from "../../../components/tasks/TaskCreateFlow";

export default function TaskNew() {
  const { company } = useOutletContext<{ company: Company }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const scope = companyScope(company.id);
  let draft: { goal?: string; deptId?: string } = {};
  try { draft = JSON.parse(sessionStorage.getItem("lgh.taskDraft") || "{}"); } catch { /* empty draft */ }
  return <TaskCreateFlow key={scope.base} scope={scope} initialGoal={draft.goal || params.get("goal") || ""} leadDeptId={params.get("dept") || draft.deptId || undefined}
    onCancel={() => navigate(`${scope.routeBase}/tasks`)} onCreated={id => { sessionStorage.removeItem("lgh.taskDraft"); navigate(`${scope.routeBase}/tasks?task=${id}`); }} />;
}
