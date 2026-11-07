import './macro-workspace.css';
import {useEffect,useMemo,useState} from 'react';
import {api} from '../../lib/api';
import {createMacroClient,type MacroPage} from '../../lib/research/macro';
import {Section,buttonClass,inputClass,type Copy} from './shared';
import {MacroTable} from './MacroTable';
import {MacroChart} from './MacroChart';
import {MacroCollection} from './MacroCollection';
import {MacroIndices} from './MacroIndices';

export function ResearchMacroData({companyId,active,tr}:{companyId:string;active:boolean;tr:Copy}){
  const client=useMemo(()=>createMacroClient(api,companyId),[companyId]);
  const [tab,setTab]=useState<'sw'|'shareholders'>('sw'),[revision,setRevision]=useState(0);
  return <Section title={tr('宏观数据')} description={tr('采集和查看申万指数、股东户数与市场分布。')}>
    <div className="macro-workspace p-4 sm:p-5 space-y-6">
      <div className="flex gap-2" aria-label={tr('数据类型')}>{(['sw','shareholders'] as const).map(v=><button key={v} className={`${buttonClass} ${tab===v?'border-primary text-primary':''}`} aria-pressed={tab===v} onClick={()=>setTab(v)}>{tr(v==='sw'?'申万指数':'股东户数')}</button>)}</div>
      <MacroCollection client={client} kind={tab} active={active} tr={tr} onRefresh={()=>setRevision(v=>v+1)}/>
      {tab==='sw'?<MacroIndices client={client} active={active} revision={revision} tr={tr}/>:<Shareholders client={client} active={active} revision={revision} tr={tr}/>}
      <p className="text-xs text-muted">{tr('数据来源：AKShare（申万宏源、东方财富）。日期为数据发布或公告日期；空白值表示源数据缺失。')}</p>
    </div>
  </Section>;
}


const initial={stock_code:'',start_date:'',end_date:'',mode:'latest',sort_by:'date',direction:'desc',page:1,page_size:50};
function Shareholders({client,active,revision,tr}:{client:ReturnType<typeof createMacroClient>;active:boolean;revision:number;tr:Copy}){
  const [draft,setDraft]=useState(initial),[filters,setFilters]=useState(initial),[data,setData]=useState<MacroPage>({items:[],total:0}),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!active)return;const controller=new AbortController();setLoading(true);setError('');setData({items:[],total:0});client.shareholders(filters,controller.signal).then(v=>{if(!controller.signal.aborted)setData(v);}).catch(()=>{if(!controller.signal.aborted)setError('查询失败，请检查筛选条件后重试。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[client,active,filters,revision]);
  const change=(key:string,value:string)=>setDraft(v=>({...v,[key]:value}));
  const counts=data.summary?.counts;
  return <div className="space-y-4" aria-busy={loading}>
    <form onSubmit={e=>{e.preventDefault();setFilters({...draft,page:1});}} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <label className="text-sm text-body">{tr('股票代码')}<input className={inputClass} value={draft.stock_code} placeholder={tr('留空查询全部股票')} pattern="[0-9]{6}" maxLength={6} onChange={e=>change('stock_code',e.target.value)}/></label>
      <label className="text-sm text-body">{tr('开始日期')}<input className={inputClass} type="date" value={draft.start_date} onChange={e=>change('start_date',e.target.value)}/></label>
      <label className="text-sm text-body">{tr('结束日期')}<input className={inputClass} type="date" value={draft.end_date} min={draft.start_date||undefined} onChange={e=>change('end_date',e.target.value)}/></label>
      <label className="text-sm text-body">{tr('视图')}<select aria-label={tr('视图')} className={inputClass} value={draft.mode} onChange={e=>change('mode',e.target.value)}><option value="latest">{tr('每股最新一期')}</option><option value="history">{tr('历史披露记录')}</option></select></label>
      <label className="text-sm text-body">{tr('排序')}<select aria-label={tr('排序')} className={inputClass} value={draft.sort_by} onChange={e=>change('sort_by',e.target.value)}>{Object.entries({date:'公告日期',code:'股票代码',count:'股东户数',change:'户数变化',ratio:'变化比例'}).map(([v,l])=><option value={v} key={v}>{tr(l)}</option>)}</select></label>
      <label className="text-sm text-body">{tr('顺序')}<select aria-label={tr('顺序')} className={inputClass} value={draft.direction} onChange={e=>change('direction',e.target.value)}><option value="desc">{tr('降序')}</option><option value="asc">{tr('升序')}</option></select></label>
      <label className="text-sm text-body">{tr('每页条数')}<select aria-label={tr('每页条数')} className={inputClass} value={draft.page_size} onChange={e=>setDraft(v=>({...v,page_size:Number(e.target.value)}))}>{[20,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
      <button className={buttonClass} disabled={loading}>{tr('查询')}</button>
    </form>
    {error&&<p role="alert" className="text-sm text-fusion">{tr(error)}</p>}
    <p className="text-xs text-muted" role="status">{loading?tr('加载中…'):`${tr('记录数')} ${data.total}`}</p>
    {counts&&<div className="space-y-2"><h3 className="text-sm text-heading">{tr('股东户数增减分布')} · {data.summary?.sample_count} {tr('只股票')}</h3><p className="text-xs text-muted">{tr('按筛选日期范围内每股最新公告统计')} · {data.summary?.earliest_date||'—'} ~ {data.summary?.latest_date||'—'}</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{Object.entries({increase:'户数增加',decrease:'户数减少',unchanged:'户数持平',unknown:'变化未知'}).map(([k,l])=><div key={k} className="text-sm text-body"><span>{tr(l)} {counts[k]}</span><progress className="block w-full mt-2" aria-label={tr(l)} max={data.summary?.sample_count||1} value={counts[k]}/></div>)}</div></div>}
    {filters.stock_code&&filters.mode==='history'&&data.items.length>0&&<MacroChart label={tr('股东户数趋势（当前页）')} data={{field:tr('股东户数'),dates:[...data.items].sort((a,b)=>String(a['公告日期']).localeCompare(String(b['公告日期']))).map(r=>String(r['公告日期'])),series:[{name:filters.stock_code,data:[...data.items].sort((a,b)=>String(a['公告日期']).localeCompare(String(b['公告日期']))).map(r=>r['股东户数'] as number|null)}]}}/>}
    <MacroTable tr={tr} rows={data.items} columns={['stock_code','stock_name','公告日期','股东户数','股东户数较上期变化','股东户数较上期变化比例','人均流通股','人均流通股市值'].map(k=>[k,k==='stock_code'?'股票代码':k==='stock_name'?'股票名称':k])}/>
    <div className="flex justify-end items-center gap-3 text-sm text-body"><button className={buttonClass} disabled={loading||(data.page||1)<=1} onClick={()=>setFilters(v=>({...v,page:(data.page||1)-1}))}>{tr('上一页')}</button><span>{data.page||1} / {data.page_count||1}</span><button className={buttonClass} disabled={loading||(data.page||1)>=(data.page_count||1)} onClick={()=>setFilters(v=>({...v,page:(data.page||1)+1}))}>{tr('下一页')}</button></div>
  </div>;
}
