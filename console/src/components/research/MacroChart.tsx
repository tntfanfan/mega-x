import { macroNumber, type Comparison } from '../../lib/research/macro';
const colors=['#51a7f9','#d69e36','#7dba92','#bb84d6','#e47d78'];
/** Discontinuous paths preserve missing observations; values remain available in the table. */
export function MacroChart({data,label}:{data:Comparison;label:string}){
  const values=data.series.flatMap(s=>s.data.filter((v):v is number=>v!=null&&Number.isFinite(v)));
  if(!values.length)return null;
  const low=Math.min(...values), high=Math.max(...values), span=high-low||1;
  const x=(i:number)=>55+i*710/Math.max(1,data.dates.length-1), y=(v:number)=>210-(v-low)*180/span;
  return <figure className="space-y-2 border border-border-solid rounded-md p-3">
    <figcaption className="text-sm text-heading">{label} · {data.field}</figcaption>
    <svg viewBox="0 0 800 245" className="w-full max-h-80" role="img" aria-label={label}>
      <line x1="55" x2="765" y1="210" y2="210" stroke="currentColor" opacity=".2"/>
      <text x="0" y="30" fill="currentColor" fontSize="11">{macroNumber(high)}</text><text x="0" y="210" fill="currentColor" fontSize="11">{macroNumber(low)}</text>
      {data.series.map((s,j)=>{let open=false;const path=s.data.map((v,i)=>{if(v==null||!Number.isFinite(v)){open=false;return '';}const p=`${open?'L':'M'}${x(i)},${y(v)}`;open=true;return p;}).join(' ');return <g key={s.name}><path d={path} fill="none" stroke={colors[j%colors.length]} strokeWidth="2"/>{s.data.map((v,i)=>v==null?null:<circle key={i} cx={x(i)} cy={y(v)} r="2" fill={colors[j%colors.length]}><title>{s.name} {data.dates[i]}: {macroNumber(v)}</title></circle>)}</g>;})}
      <text x="55" y="237" fill="currentColor" fontSize="11">{data.dates[0]}</text><text x="765" y="237" textAnchor="end" fill="currentColor" fontSize="11">{data.dates.at(-1)}</text>
    </svg>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">{data.series.map((s,i)=><li key={s.name}><span aria-hidden="true" style={{color:colors[i%colors.length]}}>● </span>{s.name}</li>)}</ul>
  </figure>;
}
