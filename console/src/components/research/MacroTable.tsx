import {macroNumber,type MacroRow} from '../../lib/research/macro';
import type {Copy} from './shared';
export function MacroTable({rows,columns,tr}:{rows:MacroRow[];columns:[string,string][];tr:Copy}){
  return <div className="overflow-x-auto border-y border-border-solid"><table className="w-full text-sm whitespace-nowrap"><thead className="bg-surface-2/60"><tr>{columns.map(([key,label])=><th key={key} className="text-start px-4 py-3 text-xs text-muted font-medium">{tr(label)}</th>)}</tr></thead><tbody className="divide-y divide-border-solid">{rows.map((row,i)=><tr key={i} className="transition-colors hover:bg-white/[0.025]">{columns.map(([key])=><td key={key} className="px-4 py-3.5 text-body tabular-nums">{macroNumber(row[key])}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="py-10 text-center text-sm text-muted">{tr('暂无数据，请调整筛选条件或发起采集。')}</p>}</div>;
}
