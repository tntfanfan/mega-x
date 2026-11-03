export type AnnReport = {id:number;announcement_id:number;impact_type:string;impact_score:number|null;impact_summary:string;report:string;key_points?:{content:string;evidence:string}[];scoring?:{confidence:string;rationale:string};validation?:{fact_review:string};created_at:string;model_used:string};
export type Announcement = {id:number;stock_code:string;stock_name:string;title:string;publish_date:string;source_url:string;source:string;analysis_status:string;analysis_error?:string;is_read:boolean;is_starred:boolean;report:AnnReport|null;content?:string;content_metadata?:{status?:string}};
export type Watch = {stock_code:string;followed_at:string};
export type AnnCapabilities = {enabled:boolean;model_ready:boolean;collect_enabled:boolean;analyze_enabled:boolean;collect_interval_seconds:number};
export type AnnJob = {id:string;kind:string;status:string;created_at:string;attempts:number;error?:string;progress:Record<string,unknown>;payload:{stock_code?:string}};
export type AnnPage = {items:Announcement[];total:number;page:number;page_size:number};
type Transport = {get<T>(path:string,options?:any):Promise<T>;post<T>(path:string,body?:any,options?:any):Promise<T>;patch<T>(path:string,body?:any,options?:any):Promise<T>;delete<T>(path:string,options?:any):Promise<T>};
export function scoreLabel(score:number|null|undefined){return score==null?'—':String(score);}
export function safeSourceUrl(value:string){try {const u=new URL(value);if(['http:','https:'].includes(u.protocol))return u.href;}catch{}return undefined;}
export function createAnnouncementsClient(transport:Transport){
  const base=(c:string)=>`/v1/companies/${encodeURIComponent(c)}/research/announcements`;
  const admin='/v1/admin/announcements';
  const options=(signal?:AbortSignal)=>({signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  return {
    capabilities:(c:string,signal?:AbortSignal)=>transport.get<AnnCapabilities>(base(c)+'/capabilities',options(signal)),
    watchlist:(c:string,signal?:AbortSignal)=>transport.get<{items:Watch[]}>(base(c)+'/watchlist',options(signal)),
    follow:(c:string,code:string)=>transport.post<Watch>(base(c)+'/watchlist',{stock_code:code},options()),
    unfollow:(c:string,code:string)=>transport.delete(base(c)+'/watchlist/'+encodeURIComponent(code),options()),
    list:(c:string,filters:Record<string,string|number>,signal?:AbortSignal)=>transport.get<AnnPage>(base(c)+'?'+new URLSearchParams(Object.entries(filters).filter(([,v])=>v!=='').map(([k,v])=>[k,String(v)])),options(signal)),
    detail:(c:string,id:number,signal?:AbortSignal)=>transport.get<Announcement>(base(c)+'/'+id,options(signal)),
    state:(c:string,id:number,changes:{is_read?:boolean;is_starred?:boolean})=>transport.patch(base(c)+'/'+id+'/state',changes,options()),
    history:(c:string,id:number,page=1)=>transport.get<{items:AnnReport[];total:number}>(base(c)+`/${id}/reports?page=${page}`,options()),
    report:(c:string,id:number,r:number)=>transport.get<AnnReport>(base(c)+`/${id}/reports/${r}`,options()),
    downloadPath:(c:string,id:number,r:number)=>base(c)+`/${id}/reports/${r}/download`,
    controls:()=>transport.get<AnnCapabilities>(admin+'/controls',options()),
    changeControls:(v:{collect_enabled?:boolean;analyze_enabled?:boolean})=>transport.patch(admin+'/controls',v,options()),
    jobs:()=>transport.get<{items:AnnJob[]}>(admin+'/jobs',options()),
    trigger:(kind:'collect'|'analyze')=>transport.post<{job_ids:string[]}>(admin+'/'+kind,{},options()),
    retry:(id:string)=>transport.post(admin+'/jobs/'+encodeURIComponent(id)+'/retry',{},options()),
    reanalyze:(id:number)=>transport.post(admin+'/'+id+'/reanalyze',{},options()),
  };
}
export type AnnClient = ReturnType<typeof createAnnouncementsClient>;
