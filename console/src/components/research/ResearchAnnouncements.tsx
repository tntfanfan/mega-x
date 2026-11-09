import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownToLine, Sparkles, Plus, X, Search, RefreshCw, FileText, Bookmark, ChevronLeft, ChevronRight, CheckCircle2, Info} from 'lucide-react';
import {api} from '../../lib/api';
import {createAnnouncementsClient,scoreLabel} from '../../lib/research/announcements';
import {useAnnouncements} from '../../hooks/useAnnouncements';
import {buttonClass, primaryClass} from './shared';
import './announcements.css';
import {AnnouncementReader} from './AnnouncementReader';

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
  const readingAnchor=useRef<HTMLDivElement>(null);
  const savedScroll=useRef<{element:HTMLElement;top:number}[]>([]);
  const readerActive=state.detailId!==null;
  const position=data.items.findIndex(row=>row.id===state.detailId);
  function openAnnouncement(id:number){
    if(!readerActive){
      savedScroll.current=[];
      let element=readingAnchor.current?.parentElement;
      while(element){if(/auto|scroll/.test(getComputedStyle(element).overflowY))savedScroll.current.push({element,top:element.scrollTop});element=element.parentElement;}
    }
    void state.open(id);
  }
  function closeReader(){
    const id=state.detailId;state.close();
    requestAnimationFrame(()=>{savedScroll.current.forEach(({element,top})=>{element.scrollTop=top;});document.getElementById('ann-open-'+id)?.focus({preventScroll:true});});
  }
  useEffect(()=>{if(readerActive)readingAnchor.current?.scrollIntoView({block:'start'});},[state.detailId]);
  useEffect(()=>{
    const anchor=readingAnchor.current;if(!readerActive||!anchor)return;
    let compact=anchor.getBoundingClientRect().width<960;
    const observer=new ResizeObserver(()=>{const next=anchor.getBoundingClientRect().width<960;if(next!==compact){compact=next;anchor.scrollIntoView({block:'start'});}});
    observer.observe(anchor);return()=>observer.disconnect();
  },[readerActive]);

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
  return <section className={'ann-workspace'+(readerActive?' ann-reader-active':'')} aria-label={tr('公告分析')}>
    <div className="ann-management">
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
    </div>
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
      <div className={'ann-reading-layout'+(!data.items.length&&!readerActive?' ann-no-results':'')} ref={readingAnchor}>
      <div className="ann-index">
      {data.items.length===0?<div className="ann-empty">
        <FileText size={28} strokeWidth={1.25} aria-hidden="true"/>
        <h4 className="text-base font-medium text-heading">{tr(filters.q||filters.status?'没有匹配的公告':state.watches.length?'正在等待新公告':'从关注一只股票开始')}</h4>
        <p>{filters.q||filters.status?tr('请调整筛选条件，或清空搜索后重试。'):state.watches.length?tr('暂时没有新公告，系统会持续监测关注股票。'):tr('添加第一只关注股票，开始监测公告。')}</p>
        {state.watches.length>0&&!filters.q&&!filters.status&&<p>{tr('点击上方“采集公告”补采最近7天，已有公告自动去重。')}</p>}
      </div>:<ul className="ann-rows">
        {data.items.map(row=><li key={row.id} className={'ann-row'+(state.detailId===row.id?' ann-row-selected':'')}>
          <button id={'ann-open-'+row.id} className="ann-row-open" aria-label={row.title} aria-current={state.detailId===row.id?'true':undefined} aria-controls="ann-reader" onClick={()=>openAnnouncement(row.id)}>
            <span className="ann-row-title">{row.title}</span>
            <span className="ann-row-meta"><span>{row.stock_name||row.stock_code}</span><time dateTime={row.publish_date}>{new Date(row.publish_date).toLocaleString()}</time></span>
            <span className="ann-row-status"><span className={'ann-analysis-status ann-analysis-'+row.analysis_status}>{tr(statusLabels[row.analysis_status]||row.analysis_status)}</span>{row.report&&<span>{tr(row.report.impact_type)} · {scoreLabel(row.report.impact_score)}</span>}{row.is_read&&<span>{tr('已读')}</span>}</span>
          </button>
          <button className={'ann-bookmark'+(row.is_starred?' text-primary':' text-muted')} aria-label={(row.is_starred?tr('取消收藏'):tr('收藏'))+' '+row.title} disabled={state.busy} onClick={()=>void state.act(()=>client.state(companyId,row.id,{is_starred:!row.is_starred}))}><Bookmark size={17} fill={row.is_starred?'currentColor':'none'} aria-hidden="true"/></button>
        </li>)}
      </ul>}
      {data.total>0&&<div className="ann-pagination text-sm"><span className="text-muted">{tr('公告总数')} {data.total}</span><div><button className={buttonClass+' ann-action'} disabled={filters.page===1||state.loading} onClick={()=>setFilters({...filters,page:filters.page-1})}><ChevronLeft size={15} aria-hidden="true"/>{tr('上一页')}</button><span className="tabular-nums">{filters.page}</span><button className={buttonClass+' ann-action'} disabled={filters.page*data.page_size>=data.total||state.loading} onClick={()=>setFilters({...filters,page:filters.page+1})}>{tr('下一页')}<ChevronRight size={15} aria-hidden="true"/></button></div></div>}
      </div>
      {readerActive?<AnnouncementReader row={state.selected} client={client} companyId={companyId} tr={tr} loading={state.detailLoading} error={state.detailError} position={position} count={data.items.length} busy={state.busy} onClose={closeReader} onPrevious={()=>{if(position>0)openAnnouncement(data.items[position-1].id);}} onNext={()=>{if(position>=0&&position<data.items.length-1)openAnnouncement(data.items[position+1].id);}} onRetry={()=>{if(state.detailId!==null)void state.open(state.detailId);}} onStar={()=>{if(state.selected)void state.act(()=>client.state(companyId,state.selected!.id,{is_starred:!state.selected!.is_starred}));}}/>:<div id="ann-reader" className="ann-reader-placeholder"><FileText size={32} strokeWidth={1.25} aria-hidden="true"/><h4>{tr('选择一条公告开始阅读')}</h4><p>{tr('在这里查看公告原文与分析报告，列表始终保留在左侧。')}</p></div>}
      </div>
    </section>
  </section>;
}
