import {useEffect,useRef,useState} from 'react';
import type {MacroClient,MacroJob} from '../../lib/research/macro';
import {buttonClass,inputClass,type Copy} from './shared';
const labels:Record<string,string>={queued:'等待采集',running:'采集中',completed:'采集完成',failed:'采集失败',stopped:'已停止'};
export function MacroCollection({client,kind,active,tr,onRefresh}:{client:MacroClient;kind:'sw'|'shareholders';active:boolean;tr:Copy;onRefresh:()=>void}){
  const [expanded,setExpanded]=useState(false);
  const [mode,setMode]=useState('latest'),[weeks,setWeeks]=useState(52),[code,setCode]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const [jobs,setJobs]=useState<MacroJob[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
  const previous=useRef<MacroJob[]>([]),refresh=useRef(onRefresh);refresh.current=onRefresh;
  useEffect(()=>{if(!active)return;const ctl=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const result=await client.jobs(ctl.signal);if(ctl.signal.aborted)return;
      if(result.items.some(j=>['completed','failed','stopped'].includes(j.status)&&previous.current.some(p=>p.id===j.id&&['queued','running'].includes(p.status))))refresh.current();
      previous.current=result.items;setJobs(result.items);setError('');
    }catch{if(!ctl.signal.aborted)setError('采集状态加载失败，正在重试。');}finally{if(!ctl.signal.aborted)timer=setTimeout(poll,3000);}}
    void poll();return()=>{ctl.abort();clearTimeout(timer);};
  },[client,active,tick]);
  async function collect(){setBusy(true);setError('');try{await client.collect(kind==='sw'?{kind,mode,weeks,...((mode==='range'||mode==='all')&&start?{start_date:start}:{}),...(mode==='range'&&end?{end_date:end}:{})}:{kind,...(code?{stock_code:code}:{})});setTick(v=>v+1);}catch{setError('采集未启动，请检查日期、股票代码和服务连接。');}finally{setBusy(false);}}
  async function stop(id:string){setBusy(true);try{await client.stop(id);setTick(v=>v+1);}catch{setError('停止失败，请刷新后重试。');}finally{setBusy(false);}}
  const running=jobs.some(j=>j.kind===kind&&['queued','running'].includes(j.status));
  useEffect(()=>{if(running)setExpanded(true);},[running]);
  return <details className="border border-border-solid rounded-md p-4" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium text-heading">{tr('数据采集与任务状态')}</summary>
    <form className="mt-4 flex flex-wrap gap-3 items-end" onSubmit={e=>{e.preventDefault();void collect();}}>
      {kind==='sw'?<>
        <label className="text-sm text-body">{tr('采集范围')}<select className={inputClass} value={mode} onChange={e=>setMode(e.target.value)}>{Object.entries({latest:'最新一周',recent:'最近 N 周',range:'指定日期范围',all:'全量历史'}).map(([v,l])=><option value={v} key={v}>{tr(l)}</option>)}</select></label>
        {mode==='recent'&&<label className="text-sm text-body">{tr('周数')}<input className={inputClass} type="number" required min={1} max={1040} value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></label>}
        {(mode==='range'||mode==='all')&&<label className="text-sm text-body">{tr('开始日期')}<input className={inputClass} type="date" required={mode==='range'} value={start} onChange={e=>setStart(e.target.value)}/></label>}
        {mode==='range'&&<label className="text-sm text-body">{tr('结束日期')}<input className={inputClass} type="date" required min={start||undefined} value={end} onChange={e=>setEnd(e.target.value)}/></label>}
      </>:<label className="text-sm text-body">{tr('股票代码')}<input className={inputClass} value={code} pattern="[0-9]{6}" maxLength={6} placeholder={tr('留空采集全市场')} onChange={e=>setCode(e.target.value)}/></label>}
      <button className={buttonClass} disabled={busy||running}>{tr('开始采集')}</button>
    </form>
    <p className="mt-3 text-xs text-muted">{tr('采集在后台运行，可离开页面。全市场与全量历史采集可能耗时较长；停止会在当前请求结束后生效。')}</p>
    {error&&<p role="alert" className="mt-3 text-sm text-fusion">{tr(error)}</p>}
    <ul className="mt-3 divide-y divide-border-solid" aria-live="polite">{jobs.filter(j=>j.kind===kind).slice(0,5).map(j=><li key={j.id} className="py-3 text-sm text-body flex items-start justify-between gap-3"><div><p>{tr(labels[j.status]||j.status)} · {j.progress.current||0}/{j.progress.total||0} · {tr('写入记录')} {j.progress.records||0} · {tr('失败项')} {j.progress.errors||0}</p>{j.error&&<p className="text-fusion">{tr(j.error)}</p>}{j.cancel===1&&j.status==='running'&&<p>{tr('正在停止…')}</p>}</div>{['queued','running'].includes(j.status)&&<button type="button" className={buttonClass} disabled={busy||j.cancel===1} onClick={()=>void stop(j.id)}>{tr('停止')}</button>}</li>)}</ul>
  </details>;
}
