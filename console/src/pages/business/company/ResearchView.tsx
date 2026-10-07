import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../../../components/ui/Toast";
import { useResearchDialogue } from "../../../hooks/useResearchDialogue";
import { InvestorCatalog } from "../../../components/research/InvestorCatalog";
import { ResearchDialogue } from "../../../components/research/ResearchDialogue";
import type { CompanyOutlet } from "./CompanyShell";
import { api, type Company } from "../../../lib/api";
import { createResearchClient } from "../../../lib/research/client";
import { createCopy, researchLanguage, dateLabel } from "../../../lib/research/copy";
import { researchPages, researchPageFromPath, type ResearchPage } from "../../../lib/research/navigation";
import { useResearch } from "../../../hooks/useResearch";
import { ResearchForm } from "../../../components/research/ResearchForm";
import { ResearchTasks } from "../../../components/research/ResearchTasks";
import { ResearchOutputs } from "../../../components/research/ResearchOutputs";
import { ResearchNavigation } from "../../../components/research/ResearchNavigation";
import { Badge, buttonClass } from "../../../components/research/shared";

export default function ResearchView() {
  const { company } = useOutletContext<CompanyOutlet>();
  return <ResearchWorkspace key={company.id} company={company} />;
}

/** Keep visited tools mounted so navigating never discards drafts or filters. */
function ResearchPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <div hidden={!active}>{children}</div>;
}

function ResearchWorkspace({ company }: { company: Company }) {
  const { i18n } = useTranslation();
  const { "*": path } = useParams();
  const navigate = useNavigate();
  const page = researchPageFromPath(path);
  const currentPage = researchPages.find(item => item.id === page)!;
  const basePath = `/business/c/${company.id}/research`;
  const language = researchLanguage(i18n.language);
  const tr = useMemo(() => createCopy(language), [language]);
  const client = useMemo(() => createResearchClient(api, import.meta.env.VITE_API_BASE || "", window.location.origin), []);
  const research = useResearch(company.id, language, client);
  const dialogue = useResearchDialogue(company.id, language, client, page === "roundtable" ? "roundtable" : "single");
  const toast = useToast();
  const conversationActive = page === "dialogue" || page === "roundtable";
  useEffect(() => {
    if (conversationActive) dialogue.selectMode(page === "roundtable" ? "roundtable" : "single");
  }, [page, dialogue.kind, dialogue.busy]);

  function openPage(next: ResearchPage) {
    const path = researchPages.find(item => item.id === next)!.path;
    navigate(`${basePath}${path ? `/${path}` : ""}`);
  }
  function canSwitchDiscussion() {
    if (!dialogue.busy) return true;
    toast.error(tr("请等待当前对话完成后再切换讨论。"));
    return false;
  }
  async function preview(path: string) {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await client.preview(company.id, path);
      if (tab) tab.location.replace(url);
      else toast.error(tr("浏览器阻止了新窗口，请允许弹出窗口后重试。"));
    } catch (error) {
      tab?.close();
      toast.error(tr(error instanceof Error ? error.message : String(error)));
    }
  }
  const error = research.error || research.syncError;
  return (
    <div className="research-workspace min-w-0 space-y-6 p-4 lg:p-6" lang={language === "zh" ? "zh-CN" : "en"} dir="ltr">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl text-heading">{tr("股票投研部")}</h1>
            <Badge state={research.department?.installation_status || company.state} tr={tr} />
          </div>
          <p className="mt-2 max-w-prose text-sm text-body">{tr(currentPage.description)}</p>
        </div>
        <button className={buttonClass} onClick={() => void research.refresh()} disabled={research.busy}>{tr("刷新状态")}</button>
      </header>
      <ResearchNavigation {...{ basePath, tr }} active={page} dialogueBusy={dialogue.busy} dialogueKind={dialogue.kind} />
      {(error || research.notice) && (
        <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-fusion" : "text-spark-mint"}`}>{tr(error || research.notice)}</p>
      )}
      <ResearchPanel active={page === "new"}>
        <ResearchForm {...{ research, language, tr }} companyState={company.state} onSubmitted={() => openPage("tasks")} />
      </ResearchPanel>
      <ResearchPanel active={page === "tasks"}>
        <ResearchTasks {...{ research, client, language, tr }} companyId={company.id} onPreview={path => void preview(path)}
          onDiscuss={report => {
            if (!canSwitchDiscussion()) return;
            dialogue.openReport(report);
            openPage("dialogue");
          }} />
      </ResearchPanel>
      <ResearchPanel active={page === "reports"}>
        <ResearchOutputs files={research.outputs} {...{ client, tr }} companyId={company.id} onPreview={path => void preview(path)} hasMore={research.outputs.length >= research.limit} onMore={research.loadMore} />
      </ResearchPanel>
      <ResearchPanel active={page === "schools"}>
        <InvestorCatalog {...{ language, tr }} onSelect={id => {
          if (!canSwitchDiscussion()) return;
          dialogue.openPersona(id);
          openPage("dialogue");
        }} />
      </ResearchPanel>
      <ResearchPanel active={conversationActive}>
        <ResearchDialogue {...{ dialogue, language, tr }} active={conversationActive} showModeSwitch={false} onPreview={path => void preview(path)} />
      </ResearchPanel>
      <footer className="flex flex-wrap justify-between gap-2 pt-2 text-xs text-muted">
        <span>{tr("最近同步 ")}{dateLabel(research.syncedAt, language)}</span>
        <span>{tr("页面显示真实任务状态，每 5 秒更新")}</span>
      </footer>
    </div>
  );
}
