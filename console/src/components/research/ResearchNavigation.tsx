import { Link } from "react-router-dom";
import { FlaskConical, ListChecks, Files, Library, MessageSquare, Users } from "lucide-react";
import { researchPages, type ResearchPage } from "../../lib/research/navigation";
import type { Copy } from "./shared";
const icons = { new: FlaskConical, tasks: ListChecks, reports: Files, schools: Library, dialogue: MessageSquare, roundtable: Users };
export function ResearchNavigation({ basePath, active, tr, dialogueBusy, dialogueKind }: {
  basePath: string;
  active: ResearchPage;
  tr: Copy;
  dialogueBusy: boolean;
  dialogueKind: "single" | "roundtable";
}) {
  return (
    <nav aria-label={tr("投研功能菜单")} className="grid grid-cols-2 gap-x-2 border-b border-border-solid sm:flex sm:flex-wrap sm:gap-x-5">
      {researchPages.map(page => {
        const Icon = icons[page.id];
        const selected = active === page.id;
        const blocked = dialogueBusy && ((page.id === "roundtable" && dialogueKind !== "roundtable") || (page.id === "dialogue" && dialogueKind !== "single"));
        return (
          <Link key={page.id} to={`${basePath}${page.path ? `/${page.path}` : ""}`}
            aria-current={selected ? "page" : undefined}
            aria-disabled={blocked || undefined}
            onClick={event => { if (blocked) event.preventDefault(); }}
            className={`flex min-h-12 items-center gap-2 border-b-2 px-1 py-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary text-primary" : "border-transparent text-body hover:text-heading hover:border-border-solid"} ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}>
            <Icon aria-hidden="true" size={17} strokeWidth={1.7} />
            {tr(page.label)}
          </Link>
        );
      })}
    </nav>
  );
}
