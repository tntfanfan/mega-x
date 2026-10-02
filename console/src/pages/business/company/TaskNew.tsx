import { Navigate, useOutletContext, useSearchParams } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";

export default function TaskNew() {
  const { company } = useOutletContext<{ company: Company }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("create", "1");
  next.delete("task");
  return <Navigate replace to={`${companyScope(company.id).routeBase}/tasks?${next}`} />;
}
