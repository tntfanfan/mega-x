import {useEffect,useMemo,useState} from 'react';
import {api} from '../../lib/api';
import {createAnnouncementsClient,scoreLabel,safeSourceUrl,type AnnReport,type Announcement,type AnnClient} from '../../lib/research/announcements';
import {useAnnouncements} from '../../hooks/useAnnouncements';
import {buttonClass} from './shared';

type Copy=(s:string)=>string;
const statusLabels:Record<string,string>={pending:'待分析',running:'分析中',completed:'已完成',failed:'分析失败',insufficient_evidence:'证据不足'};
const inputClass='rounded-md border border-border-solid bg-bg px-3 py-2 text-sm text-heading';
export function ResearchAnnouncements({companyId,active,tr}:{companyId:string;active:boolean;tr:Copy}){
  const client=useMemo(()=>createAnnouncementsClient(api),[]);
  const state=useAnnouncements(companyId,client,active);
  const [code,setCode]=useState(''),[query,setQuery]=useState('');
  const {data,filters,setFilters}=state;
  return <section className="space-y-6" aria-label={tr('公告分析')}>
    <div className="rounded-lg border border-border-solid bg-surface p-4 space-y-4">
      <div><h2 className="text-lg text-heading">{tr('我的关注')}</h2><p className="mt-1 text-sm text-muted">{tr('添加关注后，从当前开始监测公告，不补采历史。')}</p></div>
      {state.capabilities&&!state.capabilities.enabled?<p role="status" className="text-body">{tr('公告功能尚未启用，请联系管理员。')}</p>:<>
        <form className="flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();if(await state.act(()=>client.follow(companyId,code)))setCode('');}}>
          <label className="flex flex-col gap-1 text-sm text-body">{tr('A股代码')}<input className={inputClass} value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000001" required disabled={!state.capabilities?.enabled||state.busy}/></label>
          <button className={buttonClass} disabled={!state.capabilities?.enabled||state.busy}>{tr('添加关注')}</button>
        </form>
        <ul className="flex flex-wrap gap-2" aria-label={tr('关注股票')}>
          {state.watches.map(w=><li className="inline-flex items-center gap-2 rounded-md border border-border-solid px-3 py-2 text-sm" key={w.stock_code}>
            <button className="font-mono text-heading hover:text-primary" onClick={()=>setFilters({...filters,page:1,code:w.stock_code})}>{w.stock_code}</button>
            <button className="text-muted hover:text-fusion" disabled={state.busy} aria-label={tr('取消关注')+' '+w.stock_code} onClick={()=>void state.act(()=>client.unfollow(companyId,w.stock_code))}>×</button>
          </li>)}
        </ul>
        {state.capabilities?.enabled&&!state.capabilities.model_ready&&<p className="text-sm text-muted">{tr('分析模型暂未配置，采集可独立运行。')}</p>}
      </>}
    </div>
    {state.error&&<p role="alert" className="text-sm text-fusion">{tr(state.error)}</p>}
    <div className="space-y-3" aria-busy={state.loading}>
      <div className="flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setFilters({...filters,page:1,q:query});}}>
          <label className="sr-only" htmlFor="ann-search">{tr('搜索公告标题')}</label><input id="ann-search" className={inputClass} placeholder={tr('搜索公告标题')} value={query} onChange={e=>setQuery(e.target.value)}/><button className={buttonClass}>{tr('搜索')}</button>
        </form>
        <label className="sr-only" htmlFor="ann-stock">{tr('关注股票')}</label><select id="ann-stock" className={inputClass} value={filters.code} onChange={e=>setFilters({...filters,page:1,code:e.target.value})}><option value="">{tr('全部关注')}</option>{state.watches.map(w=><option key={w.stock_code}>{w.stock_code}</option>)}</select>
        <label className="sr-only" htmlFor="ann-status">{tr('分析状态')}</label><select id="ann-status" className={inputClass} value={filters.status} onChange={e=>setFilters({...filters,page:1,status:e.target.value})}><option value="">{tr('全部状态')}</option>{Object.entries(statusLabels).map(([v,s])=><option value={v} key={v}>{tr(s)}</option>)}</select>
        <button className={buttonClass} onClick={()=>void state.refresh()} disabled={state.loading}>{tr('刷新')}</button>
      </div>
      <p className="text-xs text-muted" role="status">{tr('公告总数')} {data.total}{state.loading?' · '+tr('加载中…'):''}</p>
      {data.items.length===0?<p className="border-y border-border-solid py-10 text-sm text-muted">{state.watches.length?tr('暂时没有新公告，系统会持续监测关注股票。'):tr('添加第一只关注股票，开始监测公告。')}</p>:<ul className="divide-y divide-border-solid border-y border-border-solid">
        {data.items.map(row=><li key={row.id} className="py-4 flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted">{row.stock_code} · {row.stock_name} · {new Date(row.publish_date).toLocaleString()}</p><button className="mt-1 text-start text-heading hover:text-primary break-words" onClick={()=>void state.open(row.id)}>{row.title}</button><p className="mt-1 text-xs text-muted">{tr(statusLabels[row.analysis_status]||row.analysis_status)}{row.report?' · '+tr(row.report.impact_type)+' '+scoreLabel(row.report.impact_score):''}{row.is_read?' · '+tr('已读'):''}</p></div>
          <button className="shrink-0 text-sm text-primary p-2" aria-label={(row.is_starred?tr('取消收藏'):tr('收藏'))+' '+row.title} disabled={state.busy} onClick={()=>void state.act(()=>client.state(companyId,row.id,{is_starred:!row.is_starred}))}>{row.is_starred?'★':'☆'}</button>
        </li>)}
      </ul>}
      <div className="flex items-center justify-end gap-3 text-sm"><button className={buttonClass} disabled={filters.page===1||state.loading} onClick={()=>setFilters({...filters,page:filters.page-1})}>{tr('上一页')}</button><span>{filters.page}</span><button className={buttonClass} disabled={filters.page*data.page_size>=data.total||state.loading} onClick={()=>setFilters({...filters,page:filters.page+1})}>{tr('下一页')}</button></div>
    </div>
    {state.selected&&<AnnouncementDetail key={state.selected.id} row={state.selected} client={client} companyId={companyId} tr={tr} onClose={()=>state.setSelected(null)}/>}
  </section>;
}

function AnnouncementDetail({row,client,companyId,tr,onClose}:{row:Announcement;client:AnnClient;companyId:string;tr:Copy;onClose:()=>void}){
  const [report,setReport]=useState(row.report),[history,setHistory]=useState<AnnReport[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{let current=true;client.history(companyId,row.id).then(v=>{if(current)setHistory(v.items);}).catch(()=>{if(current)setError('报告历史暂时无法加载。');});return()=>{current=false;};},[companyId,client,row.id]);
  useEffect(()=>{setReport(row.report);},[row.report?.id]);
  const source=safeSourceUrl(row.source_url);
  async function download(){if(!report)return;setLoading(true);try{const base=import.meta.env.VITE_API_BASE||'';const response=await fetch(base+client.downloadPath(companyId,row.id,report.id),{credentials:'include',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('download');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`announcement-${row.id}-report-${report.id}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('报告下载失败，请重试。');}finally{setLoading(false);}}
  return <article className="border border-border-solid rounded-lg bg-surface p-4 sm:p-6 space-y-4">
    <div className="flex items-start justify-between gap-3"><h2 className="text-xl text-heading break-words">{row.title}</h2><button className={buttonClass} onClick={onClose}>{tr('关闭')}</button></div>
    <p className="text-xs text-muted">{row.stock_code} · {tr('正文覆盖')} {tr(({complete:'完整',partial:'部分',missing:'缺失',unknown:'未知'} as Record<string,string>)[row.content_metadata?.status||'unknown']||'未知')}{source&&<> · <a href={source} target="_blank" rel="noopener noreferrer" className="text-primary">{tr('原始公告')}</a></>}</p>
    {error&&<p role="alert" className="text-sm text-fusion">{tr(error)}</p>}
    {history.length>0&&<label className="flex flex-wrap gap-2 items-center text-sm text-body">{tr('报告版本')}<select className={inputClass} value={report?.id||''} onChange={e=>setReport(history.find(r=>r.id===Number(e.target.value))||null)}>{history.map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString()} · {r.model_used}</option>)}</select></label>}
    {report?<><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg text-heading">{tr(report.impact_type)} · {scoreLabel(report.impact_score)}</h3><button className={buttonClass} disabled={loading} onClick={()=>void download()}>{tr('下载报告')}</button></div><p className="text-body">{report.impact_summary}</p>{report.scoring&&<p className="text-sm text-muted">{tr('评分依据')}：{report.scoring.rationale}</p>}<div className="whitespace-pre-wrap break-words text-sm text-body leading-7">{report.report}</div><p className="text-xs text-muted">{tr('已校验字段和原文引用，未进行事实复核。')}</p></>:<p role="status" className="text-sm text-muted">{tr(statusLabels[row.analysis_status]||'待分析')}</p>}
    <details><summary className="text-sm text-primary cursor-pointer">{tr('查看公告正文')}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-sm text-body font-sans leading-7">{row.content||tr('公告正文暂不可用。')}</pre></details>
  </article>;
}
