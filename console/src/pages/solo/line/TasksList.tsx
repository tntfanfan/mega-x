import { useOutletContext } from "react-router-dom";
import type { Company } from "../../../lib/api";
import { lineScope } from "../../../lib/workspaceScope";
import { WorkspaceTasks } from "../../../components/tasks/WorkspaceTasks";

export default function TasksList() {
  const { line } = useOutletContext<{ line: Company }>();
  return <WorkspaceTasks scope={lineScope(line.id)} />;
}
