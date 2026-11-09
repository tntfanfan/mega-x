import {useEffect,useMemo,useState} from 'react';
import {ArrowDownToLine, Sparkles, Plus, X, Search, RefreshCw, FileText, Bookmark, ChevronLeft, ChevronRight, CheckCircle2, Info} from 'lucide-react';
import {api} from '../../lib/api';
import {createAnnouncementsClient,scoreLabel,safeSourceUrl,type AnnReport,type Announcement,type AnnClient} from '../../lib/research/announcements';
import {useAnnouncements} from '../../hooks/useAnnouncements';
import {buttonClass, primaryClass} from './shared';
import './announcements.css';

type Copy=(s:string)=>string;
const statusLabels:Record<string,string>={pending:'待分析',running:'分析中',completed:'已完成',failed:'分析失败',insufficient_evidence:'证据不足'};
const inputClass='ann-input rounded-md border border-border-solid bg-bg px-3 py-2 text-sm text-heading';
export function ResearchAnnouncements({companyId,active,tr}:{companyId:string;active:boolean;tr:Copy}){
  const client=useMemo(()=>createAnnouncementsClient(api),[]);
  const state=useAnnouncements(companyId,client,active);
  const [code,setCode]=useState(''),[query,setQuery]=useState(''),[notice,setNotice]=useState('');
  const [action,setAction]=useState<'collect'|'analyze'|null>(null);
  const {data,filters,setFilters,capabilities:caps}=state;
  const enabled=Boolean(caps?.enabled);
  useEffect(()=>{setCode('');setQuery('');setNotice('');},[companyId]);
  async function trigger(kind:'collect'|'analyze'){
    if(state.busy||action)return;
    setAction(kind);setNotice('');
    try{
      await state.act(async()=>{
        const result: {job_ids:string[];failed_count?:number}=await (kind==='collect'?client.collect(companyId):client.analyze(companyId));
        setNotice(result.failed_count
          ?(result.job_ids.length?'分析任务已提交；部分失败公告需管理员检查后重试。':'公告分析曾失败，请联系管理员检查后重试。')
          :result.job_ids.length
          ?(kind==='collect'?'近7天采集任务已提交，已有公告自动去重。':'分析任务已提交，可在公告列表查看处理状态。')
          :'没有需要处理的关注股票或公告。');
      });
    }finally{setAction(null);}
  }
  return <section className="ann-workspace" aria-label={tr('公告分析')}>
    <header className="ann-actions">
      <div>
        <h2 className="text-xl text-heading">{tr('公告监测')}</h2>
        <p className="mt-2 text-sm text-muted">{tr('自动追踪新公告，手动补采最近7天。')}</p>
      </div>
      <div className="ann-action-buttons">
        <button className={primaryClass+' ann-action'} disabled={!enabled||!caps?.collect_enabled||!state.watches.length||state.busy} onClick={()=>void trigger('collect')}>
          <ArrowDownToLine size={16} aria-hidden="true"/>{tr(action==='collect'?'正在提交…':'采集公告')}
        </button>
        <button className={buttonClass+' ann-action'} disabled={!enabled||!caps?.analyze_enabled||!caps?.model_ready||!state.watches.length||state.busy} aria-describedby="ann-model-status" onClick={()=>void trigger('analyze')}>
          <Sparkles size={16} aria-hidden="true"/>{tr(action==='analyze'?'正在提交…':'分析公告')}
        </button>
      </div>
    </header>
    <div className="ann-service-status text-xs text-muted">
      <span className={enabled&&caps?.collect_enabled?'text-spark-mint':''}><span className="ann-status-dot"/>{tr(!caps?'正在获取状态…':!enabled?'公告服务未启用':caps.collect_enabled?'自动采集已开启':'自动采集已暂停')}</span>
      {enabled&&<span>{tr('采集间隔')} {Math.round((caps?.collect_interval_seconds||300)/60)} {tr('分钟')}</span>}
      <span id="ann-model-status" className="ann-model-status">{tr(!caps?'正在获取状态…':!caps.model_ready?'分析待配置：需要个人模型账户。':!caps.analyze_enabled?'公告分析已暂停':'个人分析账户已就绪')}</span>
    </div>
    <section className="ann-watchlist rounded-lg border border-border-solid bg-surface" aria-labelledby="ann-watches-title">
      <div className="ann-watchlist-header">
        <div><h3 id="ann-watches-title" className="text-lg text-heading">{tr('我的关注')} <span className="ann-count">{state.watches.length}</span></h3><p className="mt-1 text-sm text-muted">{tr('自动监测关注股票；点击“采集公告”补齐最近7天，已有公告不重复采集。')}</p></div>
        {enabled&&<form className="ann-follow-form" onSubmit={async e=>{e.preventDefault();setNotice('');if(await state.act(()=>client.follow(companyId,code)))setCode('');}}>
          <label className="sr-only" htmlFor="ann-follow-code">{tr('A股代码')}</label>
          <input id="ann-follow-code" className={inputClass} value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder={tr('输入6位股票代码')} required disabled={state.busy}/>
          <button className={buttonClass+' ann-action'} disabled={state.busy}><Plus size={16} aria-hidden="true"/>{tr('添加关注')}</button>
        </form>}
      </div>
      {!enabled&&caps?<p role="status" className="mt-4 text-sm text-body">{tr('公告功能尚未启用，请联系管理员。')}</p>:<ul className="ann-stock-list" aria-label={tr('关注股票')}>
        {state.watches.map(w=><li className={'ann-stock'+(filters.code===w.stock_code?' ann-stock-selected':'')} key={w.stock_code}>
          <button className="ann-stock-select" aria-pressed={filters.code===w.stock_code} onClick={()=>setFilters({...filters,page:1,code:filters.code===w.stock_code?'':w.stock_code})}>
            <span className="ann-stock-identity"><span className="ann-stock-name">{w.stock_name||tr('名称暂不可用')}</span><span className="font-mono text-xs text-muted">{w.stock_code}</span></span><span className="ann-stock-date">{tr('关注于')} {new Date(w.followed_at).toLocaleDateString()}</span>
          </button>
          <button className="ann-stock-remove" disabled={state.busy} aria-label={tr('取消关注')+' '+w.stock_code} onClick={()=>void state.act(()=>client.unfollow(companyId,w.stock_code))}><X size={14} aria-hidden="true"/></button>
        </li>)}
      </ul>}
    </section>
    {state.error&&<p role="alert" className="ann-feedback text-sm text-fusion"><Info size={16} aria-hidden="true"/>{tr(state.error)}</p>}
    {notice&&!state.error&&<p role="status" className="ann-feedback text-sm text-spark-mint"><CheckCircle2 size={16} aria-hidden="true"/>{tr(notice)}</p>}
    <section className="ann-results" aria-busy={state.loading} aria-labelledby="ann-results-title">
      <div className="ann-results-heading"><h3 id="ann-results-title" className="text-lg text-heading">{tr('公告列表')} <span className="ann-count">{data.total}</span></h3><span className="text-xs text-muted" role="status">{state.loading?tr('加载中…'):tr('仅展示关注股票的公告')}</span></div>
      <div className="ann-toolbar">
        <form className="ann-search" onSubmit={e=>{e.preventDefault();setFilters({...filters,page:1,q:query});}}>
          <Search size={16} aria-hidden="true"/><label className="sr-only" htmlFor="ann-search">{tr('搜索公告标题')}</label><input id="ann-search" placeholder={tr('搜索公告标题')} value={query} onChange={e=>setQuery(e.target.value)}/><button className={buttonClass}>{tr('搜索')}</button>
        </form>
        <label className="sr-only" htmlFor="ann-stock">{tr('关注股票')}</label><select id="ann-stock" className={inputClass} value={filters.code} onChange={e=>setFilters({...filters,page:1,code:e.target.value})}><option value="">{tr('全部关注')}</option>{state.watches.map(w=><option key={w.stock_code} value={w.stock_code}>{w.stock_name?`${w.stock_name} · ${w.stock_code}`:w.stock_code}</option>)}</select>
        <label className="sr-only" htmlFor="ann-status">{tr('分析状态')}</label><select id="ann-status" className={inputClass} value={filters.status} onChange={e=>setFilters({...filters,page:1,status:e.target.value})}><option value="">{tr('全部状态')}</option>{Object.entries(statusLabels).map(([v,s])=><option value={v} key={v}>{tr(s)}</option>)}</select>
        <button className={buttonClass+' ann-action'} onClick={()=>void state.refresh()} disabled={state.loading}><RefreshCw size={15} aria-hidden="true"/>{tr('刷新')}</button>
      </div>
      {data.items.length===0?<div className="ann-empty">
        <FileText size={28} strokeWidth={1.25} aria-hidden="true"/>
        <h4 className="text-base font-medium text-heading">{tr(filters.q||filters.status?'没有匹配的公告':state.watches.length?'正在等待新公告':'从关注一只股票开始')}</h4>
        <p>{filters.q||filters.status?tr('请调整筛选条件，或清空搜索后重试。'):state.watches.length?tr('暂时没有新公告，系统会持续监测关注股票。'):tr('添加第一只关注股票，开始监测公告。')}</p>
        {state.watches.length>0&&!filters.q&&!filters.status&&<p>{tr('点击上方“采集公告”补采最近7天，已有公告自动去重。')}</p>}
      </div>:<ul className="ann-rows">
        {data.items.map(row=><li key={row.id} className="ann-row">
          <FileText size={19} className="ann-row-icon" aria-hidden="true"/>
          <div className="min-w-0 flex-1"><p className="ann-row-meta"><span className="font-mono">{row.stock_code}</span><span>{row.stock_name}</span><time dateTime={row.publish_date}>{new Date(row.publish_date).toLocaleString()}</time></p>
            <button className="ann-row-title" onClick={()=>void state.open(row.id)}>{row.title}</button>
            <div className="ann-row-status"><span className={'ann-analysis-status ann-analysis-'+row.analysis_status}>{tr(statusLabels[row.analysis_status]||row.analysis_status)}</span>{row.report&&<span>{tr(row.report.impact_type)} · {scoreLabel(row.report.impact_score)}</span>}{row.is_read&&<span>{tr('已读')}</span>}</div>
          </div>
          <button className={'ann-bookmark'+(row.is_starred?' text-primary':' text-muted')} aria-label={(row.is_starred?tr('取消收藏'):tr('收藏'))+' '+row.title} disabled={state.busy} onClick={()=>void state.act(()=>client.state(companyId,row.id,{is_starred:!row.is_starred}))}><Bookmark size={18} fill={row.is_starred?'currentColor':'none'} aria-hidden="true"/></button>
        </li>)}
      </ul>}
      {data.total>0&&<div className="ann-pagination text-sm"><span className="text-muted">{tr('公告总数')} {data.total}</span><div><button className={buttonClass+' ann-action'} disabled={filters.page===1||state.loading} onClick={()=>setFilters({...filters,page:filters.page-1})}><ChevronLeft size={15} aria-hidden="true"/>{tr('上一页')}</button><span className="tabular-nums">{filters.page}</span><button className={buttonClass+' ann-action'} disabled={filters.page*data.page_size>=data.total||state.loading} onClick={()=>setFilters({...filters,page:filters.page+1})}>{tr('下一页')}<ChevronRight size={15} aria-hidden="true"/></button></div></div>}
    </section>
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
