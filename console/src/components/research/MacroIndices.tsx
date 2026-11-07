import {useEffect,useState} from 'react';
import type {MacroClient,MacroPage,Comparison,MacroRow} from '../../lib/research/macro';
import {buttonClass,inputClass,type Copy} from './shared';
import {MacroTable} from './MacroTable';
import {MacroChart} from './MacroChart';
export function MacroIndices({client,active,revision,tr}:{client:MacroClient;active:boolean;revision:number;tr:Copy}){
  const [catalog,setCatalog]=useState<MacroRow[]>([]),[fields,setFields]=useState<string[]>([]);
  const [code,setCode]=useState(''),[field,setField]=useState('市净率'),[weeks,setWeeks]=useState(104),[names,setNames]=useState<string[]>([]);
  const [query,setQuery]=useState({code:'',field:'市净率',weeks:104,names:[] as string[]});
  const [data,setData]=useState<MacroPage>({items:[],total:0}),[chart,setChart]=useState<Comparison|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!active)return;const ctl=new AbortController();client.catalog(ctl.signal).then(v=>{if(!ctl.signal.aborted){setCatalog(v.items);setFields(v.fields);}}).catch(()=>{if(!ctl.signal.aborted)setError('指数目录加载失败，请重试。');});return()=>ctl.abort();},[client,active,revision]);
  useEffect(()=>{if(!active)return;const ctl=new AbortController();setLoading(true);setError('');setData({items:[],total:0});setChart(null);
    Promise.all([client.sw(query.code,query.weeks,ctl.signal),query.names.length?client.compare(query.names,query.field,query.weeks,ctl.signal):Promise.resolve(null)]).then(([rows,comparison])=>{if(ctl.signal.aborted)return;setData(rows);setChart(comparison||(query.code?{field:query.field,dates:[...rows.items].reverse().map(r=>String(r['发布日期'])),series:[{name:String(rows.items[0]?.['指数名称']||query.code),data:[...rows.items].reverse().map(r=>r[query.field] as number|null)}]}:null));}).catch(()=>{if(!ctl.signal.aborted)setError('查询失败，请重试。');}).finally(()=>{if(!ctl.signal.aborted)setLoading(false);});return()=>ctl.abort();
  },[client,active,revision,query]);
  return <div className="space-y-5" aria-busy={loading}>
    <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_minmax(9rem,1fr)_8rem_auto] gap-3 items-end" onSubmit={e=>{e.preventDefault();setQuery({code,field,weeks,names});}}>
      <label className="grid gap-2 text-xs font-medium text-muted">{tr('指数')}<select aria-label={tr('指数')} className={inputClass} value={code} onChange={e=>setCode(e.target.value)}><option value="">{tr('全部指数（最新一期）')}</option>{catalog.map(r=><option key={String(r['指数代码'])} value={String(r['指数代码'])}>{r['指数名称']} {r['指数代码']}</option>)}</select></label>
      <label className="grid gap-2 text-xs font-medium text-muted">{tr('指标')}<select aria-label={tr('指标')} className={inputClass} value={field} onChange={e=>setField(e.target.value)}>{(fields.length?fields:['市净率']).map(f=><option key={f} value={f}>{tr(f)}</option>)}</select></label>
      <label className="grid gap-2 text-xs font-medium text-muted">{tr('周数')}<select aria-label={tr('周数')} className={inputClass} value={weeks} onChange={e=>setWeeks(Number(e.target.value))}>{[52,104,156,260,520].map(n=><option key={n}>{n}</option>)}</select></label>
      <button className={`${buttonClass} min-h-11 px-6 border-primary/40 text-primary hover:bg-primary/10`} disabled={loading}>{tr('查询')}</button>
      <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4 border-t border-border-solid pt-5 mt-2"><legend className="pr-3 text-xs font-medium text-muted">{tr('对比指数（最多 5 个，可留空）')}<span className="ml-3 tabular-nums text-primary">{names.length} / 5</span></legend><div className="flex flex-wrap gap-2 pt-2">{catalog.map(r=>{const name=String(r['指数名称']);return <label key={String(r['指数代码'])} className={`relative flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary/60 ${names.includes(name)?"border-primary/50 bg-primary/10 text-primary":"border-border-solid text-body hover:border-primary/30 hover:text-heading"} ${!names.includes(name)&&names.length>=5?"cursor-not-allowed opacity-40":""}`}><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={names.includes(name)} disabled={!names.includes(name)&&names.length>=5} onChange={e=>setNames(v=>e.target.checked?[...v,name]:v.filter(n=>n!==name))}/>{name}</label>;})}</div></fieldset>
    </form>
    {error&&<p role="alert" className="text-sm text-fusion">{tr(error)}</p>}
    <p role="status" className="border-t border-border-solid pt-4 text-xs text-muted tabular-nums">{loading?tr('加载中…'):`${tr('记录数')} ${data.total}`}</p>
    {chart&&<><MacroChart data={{...chart,field:tr(chart.field)}} label={tr('指数走势与对比')}/><details className="grid gap-2 text-xs font-medium text-muted"><summary className="cursor-pointer">{tr('查看对比数据')}</summary><MacroTable tr={tr} rows={chart.dates.map((d,i)=>Object.fromEntries([['发布日期',d],...chart.series.map(s=>[s.name,s.data[i]])]))} columns={['发布日期',...chart.series.map(s=>s.name)].map(s=>[s,s])}/></details></>}
    <MacroTable tr={tr} rows={data.items} columns={['指数代码','指数名称','发布日期','收盘指数','涨跌幅','市盈率','市净率','成交量','换手率','股息率'].map(s=>[s,s])}/>
  </div>;
}
