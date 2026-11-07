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
  return <div className="space-y-4" aria-busy={loading}>
    <form className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end" onSubmit={e=>{e.preventDefault();setQuery({code,field,weeks,names});}}>
      <label className="text-sm text-body">{tr('指数')}<select aria-label={tr('指数')} className={inputClass} value={code} onChange={e=>setCode(e.target.value)}><option value="">{tr('全部指数（最新一期）')}</option>{catalog.map(r=><option key={String(r['指数代码'])} value={String(r['指数代码'])}>{r['指数名称']} {r['指数代码']}</option>)}</select></label>
      <label className="text-sm text-body">{tr('指标')}<select aria-label={tr('指标')} className={inputClass} value={field} onChange={e=>setField(e.target.value)}>{(fields.length?fields:['市净率']).map(f=><option key={f} value={f}>{tr(f)}</option>)}</select></label>
      <label className="text-sm text-body">{tr('周数')}<select aria-label={tr('周数')} className={inputClass} value={weeks} onChange={e=>setWeeks(Number(e.target.value))}>{[52,104,156,260,520].map(n=><option key={n}>{n}</option>)}</select></label>
      <button className={buttonClass} disabled={loading}>{tr('查询')}</button>
      <fieldset className="col-span-2 lg:col-span-4 border border-border-solid rounded-md p-3"><legend className="px-1 text-sm text-body">{tr('对比指数（最多 5 个，可留空）')}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{catalog.map(r=>{const name=String(r['指数名称']);return <label key={String(r['指数代码'])} className="text-sm text-body flex items-center gap-2"><input type="checkbox" checked={names.includes(name)} disabled={!names.includes(name)&&names.length>=5} onChange={e=>setNames(v=>e.target.checked?[...v,name]:v.filter(n=>n!==name))}/>{name}</label>;})}</div></fieldset>
    </form>
    {error&&<p role="alert" className="text-sm text-fusion">{tr(error)}</p>}
    <p role="status" className="text-xs text-muted">{loading?tr('加载中…'):`${tr('记录数')} ${data.total}`}</p>
    {chart&&<><MacroChart data={{...chart,field:tr(chart.field)}} label={tr('指数走势与对比')}/><details className="text-sm text-body"><summary className="cursor-pointer">{tr('查看对比数据')}</summary><MacroTable tr={tr} rows={chart.dates.map((d,i)=>Object.fromEntries([['发布日期',d],...chart.series.map(s=>[s.name,s.data[i]])]))} columns={['发布日期',...chart.series.map(s=>s.name)].map(s=>[s,s])}/></details></>}
    <MacroTable tr={tr} rows={data.items} columns={['指数代码','指数名称','发布日期','收盘指数','涨跌幅','市盈率','市净率','成交量','换手率','股息率'].map(s=>[s,s])}/>
  </div>;
}
