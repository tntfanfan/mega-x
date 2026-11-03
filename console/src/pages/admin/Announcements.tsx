import {useCallback,useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {api} from '../../lib/api';
import {createCopy,researchLanguage} from '../../lib/research/copy';
import {createAnnouncementsClient,type AnnCapabilities,type AnnJob} from '../../lib/research/announcements';
import {buttonClass} from '../../components/research/shared';
export default function Announcements(){
  const {i18n}=useTranslation();const tr=useMemo(()=>createCopy(researchLanguage(i18n.language)),[i18n.language]);
  const client=useMemo(()=>createAnnouncementsClient(api),[]);
  const [controls,setControls]=useState<AnnCapabilities|null>(null),[jobs,setJobs]=useState<AnnJob[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[announcementId,setAnnouncementId]=useState('');
  const refresh=useCallback(async()=>{const [c,j]=await Promise.all([client.controls(),client.jobs()]);setControls(c);setJobs(j.items);},[client]);
  useEffect(()=>{let live=true;async function load(){try{const [c,j]=await Promise.all([client.controls(),client.jobs()]);if(live){setControls(c);setJobs(j.items);setError('');}}catch{if(live)setError('公告中心不可用，请检查功能配置或刷新重试。');}}void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},10000);return()=>{live=false;clearInterval(timer);};},[client]);
  async function act(operation:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await operation() as {job_ids?:string[]};setNotice(result?.job_ids?.length===0?'没有需要处理的关注股票或公告。':'操作已提交。');await refresh();}catch{setError('操作未完成，请重试。');}finally{setBusy(false);}}
  const labels:Record<string,string>={queued:'排队中',retry:'等待重试',running:'运行中',completed:'已完成',failed:'失败'};
  return <section className="container py-8 space-y-6">
    <header><h1 className="text-3xl text-heading">{tr('公告采集与分析中心')}</h1><p className="mt-2 text-sm text-body">{tr('仅处理有效关注股票。公告和分析结果由平台共享，个人关注与收藏独立保存。')}</p></header>
    {error&&<p role="alert" className="text-fusion text-sm">{tr(error)}</p>}{notice&&<p role="status" className="text-primary text-sm">{tr(notice)}</p>}
    <div className="grid md:grid-cols-2 gap-4">{(['collect','analyze'] as const).map(kind=>{const key=kind==='collect'?'collect_enabled':'analyze_enabled';return <section className="rounded-lg border border-border-solid bg-surface p-5 space-y-4" key={kind}>
      <h2 className="text-lg text-heading">{tr(kind==='collect'?'公告采集':'公告分析')}</h2><p className="text-sm text-muted">{tr(kind==='collect'?'从关注时点开始定向采集，不补采历史。':'复用已有成功报告，只分析待处理公告。')}</p>
      <label className="flex items-center gap-2 text-sm text-body"><input type="checkbox" checked={controls?.[key]||false} disabled={!controls||busy} onChange={e=>void act(()=>client.changeControls({[key]:e.target.checked}))}/>{tr('启用自动处理')}</label>
      {kind==='analyze'&&controls&&!controls.model_ready&&<p className="text-sm text-muted">{tr('分析模型暂未配置，采集可独立运行。')}</p>}
      <button className={buttonClass} disabled={!controls||busy||!controls[key]||(kind==='analyze'&&!controls.model_ready)} onClick={()=>void act(()=>client.trigger(kind))}>{tr(kind==='collect'?'采集关注股票':'分析待处理公告')}</button>
    </section>;})}</div>
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border-solid p-4" onSubmit={e=>{e.preventDefault();void act(()=>client.reanalyze(Number(announcementId)));}}><label className="flex flex-col gap-1 text-sm text-body">{tr('重新分析公告')}<input className="rounded-md border border-border-solid bg-bg px-3 py-2 text-heading" type="number" min="1" required value={announcementId} onChange={e=>setAnnouncementId(e.target.value)}/></label><button className={buttonClass} disabled={busy||!controls?.model_ready||!controls?.analyze_enabled}>{tr('创建新报告版本')}</button><p className="text-xs text-muted">{tr('旧成功报告保留，重新分析会调用模型。')}</p></form>
    <div className="flex justify-between items-center gap-3"><h2 className="text-lg text-heading">{tr('处理记录')}</h2><button className={buttonClass} disabled={busy} onClick={()=>void act(()=>refresh())}>{tr('刷新')}</button></div>
    {!jobs.length?<p className="text-sm text-muted">{tr('暂无处理记录。')}</p>:<ul className="divide-y divide-border-solid border-y border-border-solid">{jobs.map(job=><li className="py-4 flex flex-wrap justify-between gap-3" key={job.id}><div className="min-w-0"><p className="text-heading">{tr(job.kind==='collect'?'公告采集':'公告分析')} · {job.payload.stock_code||'—'} · {tr(labels[job.status]||job.status)}</p><p className="mt-1 text-xs text-muted">{new Date(job.created_at).toLocaleString()} · {tr('尝试次数')} {job.attempts}</p><p className="mt-1 text-sm text-body">{tr('新增公告')} {String(job.progress.new??'—')}{job.progress.report_id?' · '+tr('报告编号')+' '+job.progress.report_id:''}{job.progress.skipped?' · '+tr('已跳过'):''}</p>{job.error&&<p className="mt-1 text-sm text-fusion">{tr('处理失败，可重试；证据不足需先修复正文。')}</p>}</div>{['failed','retry'].includes(job.status)&&<button className={buttonClass} disabled={busy} onClick={()=>void act(()=>client.retry(job.id))}>{tr('重试')}</button>}</li>)}</ul>}
  </section>;
}
