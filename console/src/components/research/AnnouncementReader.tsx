import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,ExternalLink,Download,Bookmark,FileText,Info} from 'lucide-react';
import {Markdown} from '../ui/Markdown';
import {safeSourceUrl,scoreLabel,type Announcement,type AnnClient,type AnnReport} from '../../lib/research/announcements';
import {buttonClass} from './shared';

type Props={row:Announcement|null;client:AnnClient;companyId:string;tr:(s:string)=>string;loading:boolean;error:string;position:number;count:number;busy:boolean;onClose:()=>void;onPrevious:()=>void;onNext:()=>void;onRetry:()=>void;onStar:()=>void};
export function AnnouncementReader({row,client,companyId,tr,loading,error,position,count,busy,onClose,onPrevious,onNext,onRetry,onStar}:Props){
  const heading=useRef<HTMLHeadingElement>(null),scroll=useRef<HTMLDivElement>(null);
  const back=useRef<HTMLButtonElement>(null),retry=useRef<HTMLButtonElement>(null),downloadRequest=useRef<AbortController|null>(null);
  const [tab,setTab]=useState<'content'|'report'>('content');
  const [report,setReport]=useState<AnnReport|null>(null),[history,setHistory]=useState<AnnReport[]>([]),[historyError,setHistoryError]=useState(''),[downloadError,setDownloadError]=useState(''),[downloading,setDownloading]=useState(false);
  useEffect(()=>{
    setTab(row?.report?'report':'content');setReport(row?.report||null);setHistory([]);setHistoryError('');setDownloadError('');
    downloadRequest.current?.abort();downloadRequest.current=null;setDownloading(false);
    if(scroll.current)scroll.current.scrollTop=0;
    if(!row)return;
    heading.current?.focus({preventScroll:true});
    let live=true;
    client.history(companyId,row.id).then(value=>{if(live)setHistory(value.items);}).catch(()=>{if(live)setHistoryError('报告历史暂时无法加载。');});
    return()=>{live=false;downloadRequest.current?.abort();};
  },[companyId,client,row?.id]);
  useEffect(()=>{if(loading)back.current?.focus({preventScroll:true});else if(error)retry.current?.focus({preventScroll:true});},[loading,error]);
  useEffect(()=>{if(row?.report)setReport(previous=>previous?.id===row.report?.id?previous:row.report);},[row?.report?.id]);
  const source=safeSourceUrl(row?.source_url||'');
  async function download(){
    if(!row||!report)return;setDownloading(true);setDownloadError('');
    const controller=new AbortController();downloadRequest.current=controller;
    try{
      const base=import.meta.env.VITE_API_BASE||'';
      const response=await fetch(base+client.downloadPath(companyId,row.id,report.id),{credentials:'include',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(!response.ok)throw Error('download');
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
      if(controller.signal.aborted){URL.revokeObjectURL(url);return;}
      link.href=url;link.download=`announcement-${row.id}-report-${report.id}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{if(!controller.signal.aborted)setDownloadError('报告下载失败，请重试。');}finally{if(downloadRequest.current===controller){downloadRequest.current=null;setDownloading(false);}}
  }
  return <section id="ann-reader" className="ann-reader" role="region" aria-label={tr('公告阅读区')} aria-busy={loading}>
    <div className="ann-reader-toolbar">
      <button ref={back} className="ann-reader-back" onClick={onClose}><ArrowLeft size={16} aria-hidden="true"/>{tr('返回公告列表')}</button>
      <div className="ann-reader-navigation"><span className="text-xs text-muted tabular-nums" aria-label={tr('当前页公告位置')}>{position>=0?`${position+1} / ${count}`:'—'}</span><button disabled={position<=0||loading} aria-label={tr('上一条公告')} onClick={onPrevious}><ChevronLeft size={18}/></button><button disabled={position<0||position>=count-1||loading} aria-label={tr('下一条公告')} onClick={onNext}><ChevronRight size={18}/></button></div>
    </div>
    <div className="ann-reader-scroll" ref={scroll}>
      {loading?<div className="ann-reader-loading" role="status"><p>{tr('正在加载公告…')}</p><div/><div/><div/></div>:error?<div className="ann-reader-message" role="alert"><Info size={24} aria-hidden="true"/><h3>{tr(error)}</h3><button ref={retry} className={buttonClass} onClick={onRetry}>{tr('重试加载')}</button></div>:row?<>
        <header className="ann-document-header">
          <p className="ann-document-meta"><span>{row.stock_name}</span><span className="font-mono">{row.stock_code}</span><time dateTime={row.publish_date}>{new Date(row.publish_date).toLocaleString()}</time></p>
          <h2 ref={heading} tabIndex={-1}>{row.title}</h2>
          <div className="ann-document-actions">
            <span className="text-xs text-muted">{tr('正文覆盖')}：{tr(({complete:'完整',partial:'部分',missing:'缺失',unknown:'未知'} as Record<string,string>)[row.content_metadata?.status||'unknown']||'未知')}</span>
            {source&&<a href={source} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true"/>{tr('原始公告')}</a>}
            <button disabled={busy} onClick={onStar} aria-label={tr(row.is_starred?'取消收藏当前公告':'收藏当前公告')}><Bookmark size={15} fill={row.is_starred?'currentColor':'none'} aria-hidden="true"/>{tr(row.is_starred?'已收藏':'收藏')}</button>
          </div>
        </header>
        <div className="ann-document-tabs" role="tablist" aria-label={tr('阅读内容')} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'content':event.key==='End'?'report':tab==='content'?'report':'content';setTab(next);document.getElementById('ann-tab-'+next)?.focus();}}>
          <button id="ann-tab-content" role="tab" aria-selected={tab==='content'} tabIndex={tab==='content'?0:-1} aria-controls="ann-content-panel" onClick={()=>setTab('content')}>{tr('公告原文')}</button>
          <button id="ann-tab-report" role="tab" aria-label={tr('分析报告')} aria-selected={tab==='report'} tabIndex={tab==='report'?0:-1} aria-controls="ann-report-panel" onClick={()=>setTab('report')}>{tr('分析报告')}{!report&&<span aria-hidden="true">{tr('待生成')}</span>}</button>
        </div>
        <div id="ann-content-panel" role="tabpanel" aria-labelledby="ann-tab-content" hidden={tab!=='content'} tabIndex={0} className="ann-document-content">
          {row.content?<div className="ann-original-text">{row.content}</div>:<div className="ann-reader-message"><FileText size={24} aria-hidden="true"/><p>{tr('公告正文暂不可用。')}</p>{source&&<a className="text-primary" href={source} target="_blank" rel="noopener noreferrer">{tr('查看原始公告')}</a>}</div>}
        </div>
        <div id="ann-report-panel" role="tabpanel" aria-labelledby="ann-tab-report" hidden={tab!=='report'} tabIndex={0} className="ann-document-content">
          {historyError&&<p role="status" className="text-sm text-muted mb-4">{tr(historyError)}</p>}
          {downloadError&&<p role="alert" className="text-sm text-fusion mb-4">{tr(downloadError)}</p>}
          {report?<>
            <div className="ann-report-controls">{history.length>1&&<label>{tr('报告版本')}<select value={report.id} onChange={e=>setReport(history.find(r=>r.id===Number(e.target.value))||null)}>{history.map(item=><option value={item.id} key={item.id}>{new Date(item.created_at).toLocaleString()} · {item.model_used}</option>)}</select></label>}<button className={buttonClass+' ann-action'} disabled={downloading} onClick={()=>void download()}><Download size={15} aria-hidden="true"/>{tr(downloading?'下载中…':'下载报告')}</button></div>
            <div className="ann-report-summary"><h3>{tr(report.impact_type)} · {scoreLabel(report.impact_score)}</h3><p>{report.impact_summary}</p>{report.scoring&&<p className="text-sm text-muted">{tr('评分依据')}：{report.scoring.rationale}</p>}</div>
            <Markdown text={report.report} variant="article"/>
            <p className="ann-report-disclaimer">{tr('已校验字段和原文引用，未进行事实复核。')}</p>
          </>:<div className="ann-reader-message"><FileText size={24} aria-hidden="true"/><h3>{tr(({pending:'待分析',running:'分析中',failed:'分析失败',insufficient_evidence:'证据不足'} as Record<string,string>)[row.analysis_status]||'待分析')}</h3><p>{tr('当前公告尚未生成分析报告，可先阅读公告原文。')}</p><button className={buttonClass} onClick={()=>setTab('content')}>{tr('阅读公告原文')}</button></div>}
        </div>
      </>:null}
    </div>
  </section>;
}
