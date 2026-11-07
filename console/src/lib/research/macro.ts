export type MacroRow = Record<string, string | number | null>;
export type MacroPage = {items: MacroRow[]; total: number; page?:number; page_count?:number; summary?:{sample_count:number;counts:Record<string,number>;earliest_date:string|null;latest_date:string|null}};
export type MacroJob = {id:string;kind:'sw'|'shareholders';status:string;cancel:number;error:string|null;progress:{current?:number;total?:number;records?:number;errors?:number}};
export type Comparison = {field:string;dates:string[];series:{name:string;data:(number|null)[]}[]};
type Transport = {get<T>(path:string,options?:any):Promise<T>;post<T>(path:string,body?:any,options?:any):Promise<T>};
export function createMacroClient(transport:Transport,company:string){
  const base=`/v1/companies/${encodeURIComponent(company)}/research/macro`;
  const opts=(signal?:AbortSignal)=>({signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  const query=(v:Record<string,string|number>)=>new URLSearchParams(Object.entries(v).filter(([,v])=>v!=='').map(([k,v])=>[k,String(v)]));
  return {
    sw:(code='',limit=104,signal?:AbortSignal)=>transport.get<MacroPage>(`${base}/sw?${query({code,limit})}`,opts(signal)),
    catalog:(signal?:AbortSignal)=>transport.get<{items:MacroRow[];fields:string[]}>(base+'/catalog',opts(signal)),
    compare:(names:string[],field:string,limit:number,signal?:AbortSignal)=>transport.get<Comparison>(`${base}/compare?${query({names:names.join(','),field,limit})}`,opts(signal)),
    shareholders:(filters:Record<string,string|number>,signal?:AbortSignal)=>transport.get<MacroPage>(`${base}/shareholders?${query(filters)}`,opts(signal)),
    jobs:(signal?:AbortSignal)=>transport.get<{items:MacroJob[]}>(base+'/jobs',opts(signal)),
    collect:(body:Record<string,string|number>)=>transport.post<MacroJob>(base+'/jobs',body,opts()),
    stop:(id:string)=>transport.post(base+'/jobs/'+encodeURIComponent(id)+'/stop',{},opts()),
  };
}
export type MacroClient=ReturnType<typeof createMacroClient>;
export const macroNumber=(value:unknown)=>value==null?'—':typeof value==='number'?value.toLocaleString(undefined,{maximumFractionDigits:2}):String(value);
