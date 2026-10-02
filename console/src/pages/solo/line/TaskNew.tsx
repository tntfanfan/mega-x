import { Navigate, useOutletContext, useSearchParams } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { lineScope } from "../../../lib/workspaceScope";

export default function TaskNew() {
  const { line } = useOutletContext<{ line: Company }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("create", "1");
  next.delete("task");
  return <Navigate replace to={`${lineScope(line.id).routeBase}/tasks?${next}`} />;
}
