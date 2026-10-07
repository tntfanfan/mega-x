import { useMemo } from 'react';
import { useToast } from '../../../components/ui/Toast';
import { useResearchDialogue } from '../../../hooks/useResearchDialogue';
import { InvestorCatalog } from '../../../components/research/InvestorCatalog';
import { ResearchDialogue } from '../../../components/research/ResearchDialogue';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CompanyOutlet } from './CompanyShell';
import type { Company } from '../../../lib/api';
import { api } from '../../../lib/api';
import { createResearchClient } from '../../../lib/research/client';
import { createCopy, researchLanguage, dateLabel } from '../../../lib/research/copy';
import { useResearch } from '../../../hooks/useResearch';
import { ResearchForm } from '../../../components/research/ResearchForm';
import { ResearchTasks } from '../../../components/research/ResearchTasks';
import { ResearchOutputs } from '../../../components/research/ResearchOutputs';
import { buttonClass } from '../../../components/research/shared';
export default function ResearchView(){
  const {company}=useOutletContext<CompanyOutlet>();
  return <ResearchWorkspace key={company.id} company={company}/>;
}
function ResearchWorkspace({company}:{company:Company}){
  const {i18n}=useTranslation();const language=researchLanguage(i18n.language),tr=useMemo(()=>createCopy(language),[language]);
  const client=useMemo(()=>createResearchClient(api,import.meta.env.VITE_API_BASE||'',window.location.origin),[]);
  const research=useResearch(company.id,language,client),dialogue=useResearchDialogue(company.id,language,client),toast=useToast();
  const showDialogue=()=>document.getElementById('dialogue')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  async function preview(path:string){
    const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
    try{const url=await client.preview(company.id,path);if(tab)tab.location.replace(url);else toast.error(tr('浏览器阻止了新窗口，请允许弹出窗口后重试。'));}
    catch(error){tab?.close();toast.error(tr(error instanceof Error?error.message:String(error)));}
  }
  return <div className="research-workspace space-y-5 p-4 lg:p-6" lang={language==='zh'?'zh-CN':'en'} dir="ltr">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl text-heading">{tr('股票投研部')}</h1><p className="mt-2 text-sm text-body">{tr('从一个股票代码开始，跟踪执行过程，查看每一次交付。')}</p></div><button className={buttonClass} onClick={()=>void research.refresh()} disabled={research.busy}>{tr('刷新状态')}</button></header>
    {(research.error||research.notice)&&<p role={research.error?'alert':'status'} className={`text-sm ${research.error?'text-fusion':'text-spark-mint'}`}>{tr(research.error||research.notice)}</p>}
    <ResearchForm {...{research,language,tr}} companyState={company.state}/>
    <ResearchTasks {...{research,client,language,tr}} companyId={company.id} onPreview={path=>void preview(path)} onDiscuss={report=>{dialogue.openReport(report);showDialogue();}}/>
    <ResearchOutputs files={research.outputs} {...{client,tr}} companyId={company.id} onPreview={path=>void preview(path)} hasMore={research.outputs.length>=research.limit} onMore={research.loadMore}/>
    <InvestorCatalog {...{language,tr}} onSelect={id=>{dialogue.openPersona(id);showDialogue();}}/>
    <ResearchDialogue {...{dialogue,language,tr}} onPreview={path=>void preview(path)}/>
    <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>{tr('最近同步 ')}{dateLabel(research.syncedAt,language)}</span><span>{tr('页面显示真实任务状态，每 5 秒更新')}</span></footer>
  </div>;
}
