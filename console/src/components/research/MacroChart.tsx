import { macroNumber, type Comparison } from '../../lib/research/macro';
const colors=['#D4A84E','#7dba92','#51a7f9','#bb84d6','#e47d78'];
/** Discontinuous paths preserve missing observations; values remain available in the table. */
export function MacroChart({data,label}:{data:Comparison;label:string}){
  const values=data.series.flatMap(s=>s.data.filter((v):v is number=>v!=null&&Number.isFinite(v)));
  if(!values.length)return null;
  const low=Math.min(...values), high=Math.max(...values), span=high-low||1;
  const x=(i:number)=>(data.dates.length===1?410:55+i*710/Math.max(1,data.dates.length-1)), y=(v:number)=>high===low?120:210-(v-low)*180/span;
  return <figure className="space-y-4 rounded-lg bg-surface-2/40 p-4 text-muted sm:p-5">
    <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-heading">{label}<span className="text-xs font-normal text-muted">{data.field}</span></figcaption>
    <svg viewBox="0 0 800 245" className="w-full max-h-80 overflow-visible" role="img" aria-label={label}>
      {[30,90,150,210].map(y=><line key={y} x1="55" x2="765" y1={y} y2={y} stroke="currentColor" opacity=".12"/>)}
      <text x="0" y={high===low?120:30} fill="currentColor" fontSize="11">{macroNumber(high)}</text>{high!==low&&<text x="0" y="210" fill="currentColor" fontSize="11">{macroNumber(low)}</text>}
      {data.series.map((s,j)=>{let open=false;const path=s.data.map((v,i)=>{if(v==null||!Number.isFinite(v)){open=false;return '';}const p=`${open?'L':'M'}${x(i)},${y(v)}`;open=true;return p;}).join(' ');return <g key={s.name}><path d={path} fill="none" stroke={colors[j%colors.length]} strokeWidth="2"/>{s.data.map((v,i)=>v==null?null:<circle key={i} cx={x(i)} cy={y(v)} r={data.dates.length===1?4:2} fill={colors[j%colors.length]}><title>{s.name} {data.dates[i]}: {macroNumber(v)}</title></circle>)}</g>;})}
      <text x={data.dates.length===1?410:55} textAnchor={data.dates.length===1?"middle":"start"} y="237" fill="currentColor" fontSize="11">{data.dates[0]}</text>{data.dates.length>1&&<text x="765" y="237" textAnchor="end" fill="currentColor" fontSize="11">{data.dates.at(-1)}</text>}
    </svg>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">{data.series.map((s,i)=><li key={s.name}><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full" style={{backgroundColor:colors[i%colors.length]}}/>{s.name}</li>)}</ul>
  </figure>;
}
