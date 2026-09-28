import { useState } from "react";
import { sandboxScope } from "../../lib/workspaceScope";
import { WorkspaceTasks } from "../tasks/WorkspaceTasks";
import { OutputsPane } from "../outputs/OutputsPane";

/** Department test: the business chat/task/output layout pointed at a DevCell sandbox. */
export function TestWorkspace({ draftId }: { draftId: string }) {
  const scope = sandboxScope(draftId);
  const [tab, setTab] = useState<"tasks" | "outputs">("tasks");
  return (
    <div className="flex-1 flex min-h-0">
      <nav className="w-24 shrink-0 border-e border-border-solid p-2 space-y-1">
        <button type="button" className={`block w-full text-xs rounded px-2 py-1 ${tab === "tasks" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => setTab("tasks")}>任务</button>
        <button type="button" className={`block w-full text-xs rounded px-2 py-1 ${tab === "outputs" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => setTab("outputs")}>产出</button>
      </nav>
      {tab === "tasks" ? <WorkspaceTasks scope={scope} /> : <OutputsPane scope={scope} className="flex-1" />}
    </div>
  );
}
