import { Navigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";

/** Preserve old task URLs and run/file context in the unified task view. */
export default function TaskDetail() {
  const { company } = useOutletContext<{ company: Company }>();
  const { taskId } = useParams();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (taskId) next.set("task", taskId);
  next.delete("kind");
  return <Navigate replace to={`${companyScope(company.id).routeBase}/tasks?${next}`} />;
}
