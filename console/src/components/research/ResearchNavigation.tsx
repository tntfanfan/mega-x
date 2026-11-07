import { Link } from "react-router-dom";
import { FlaskConical, ListChecks, Files, Library, MessageSquare, Users } from "lucide-react";
import { researchSections, researchSectionForPage, stockResearchPages, type ResearchPage } from "../../lib/research/navigation";
import type { Copy } from "./shared";
const icons: Record<ResearchPage, typeof FlaskConical> = { macro: ListChecks, announcements: Files, new: FlaskConical, tasks: ListChecks, reports: Files, schools: Library, dialogue: MessageSquare, roundtable: Users };
export function ResearchNavigation({ hrefFor, active, tr, dialogueBusy, dialogueKind }: {
  hrefFor: (page: ResearchPage) => string;
  active: ResearchPage;
  tr: Copy;
  dialogueBusy: boolean;
  dialogueKind: "single" | "roundtable";
}) {
  const section = researchSectionForPage(active);
  return (
    <div className="min-w-0 space-y-3">
      <nav aria-label={tr("投研分析模块")} className="grid grid-cols-3 gap-1 rounded-lg border border-border-solid bg-surface p-1 sm:inline-flex sm:gap-2">
        {researchSections.map(item => {
          const selected = section === item.id;
          return <Link key={item.id} to={hrefFor(item.page)} aria-current={selected ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-w-32 sm:px-5 ${selected ? "bg-primary text-black" : "text-body hover:bg-white/5 hover:text-heading"}`}>
            {tr(item.label)}
          </Link>;
        })}
      </nav>
      {section === "stock" && (
    <nav aria-label={tr("投研功能菜单")} className="grid grid-cols-2 gap-x-2 border-b border-border-solid sm:flex sm:flex-wrap sm:gap-x-5">
      {stockResearchPages.map(page => {
        const Icon = icons[page.id];
        const selected = active === page.id;
        const blocked = dialogueBusy && ((page.id === "roundtable" && dialogueKind !== "roundtable") || (page.id === "dialogue" && dialogueKind !== "single"));
        return (
          <Link key={page.id} to={hrefFor(page.id)}
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
      )}
    </div>
  );
}
