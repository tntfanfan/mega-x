import { useOutletContext } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";
import { WorkspaceTasks } from "../../../components/tasks/WorkspaceTasks";

type Ctx = { company: Company };

export default function TasksList() {
  const { company } = useOutletContext<Ctx>();
  return <WorkspaceTasks scope={companyScope(company.id)} />;
}
