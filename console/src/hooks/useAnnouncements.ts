import {useState,useEffect,useCallback,useRef} from 'react';
import type {AnnClient,AnnCapabilities,AnnPage,Watch,Announcement} from '../lib/research/announcements';
import {apiErrorMessage} from '../lib/api';
const empty:AnnPage={items:[],total:0,page:1,page_size:20};
export function useAnnouncements(company:string,client:AnnClient,active:boolean){
  const [capabilities,setCapabilities]=useState<AnnCapabilities|null>(null);
  const [watches,setWatches]=useState<Watch[]>([]);
  const [data,setData]=useState<AnnPage>(empty);
  const [filters,setFilters]=useState({page:1,code:'',status:'',q:''});
  const [selected,setSelected]=useState<Announcement|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const epoch=useRef(0),detailEpoch=useRef(0),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;detailEpoch.current++;};},[]);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const version=++epoch.current;
    setLoading(true);
    try{
      const caps=await client.capabilities(company,signal);
      if(version!==epoch.current||!mounted.current)return;
      setCapabilities(caps);
      if(!caps.enabled){setData(empty);setWatches([]);setSelected(null);return;}
      const [list,watch]=await Promise.all([client.list(company,filters,signal),client.watchlist(company,signal)]);
      if(version!==epoch.current||!mounted.current)return;
      setData(list);setWatches(watch.items);setError('');
      if(filters.code&&!watch.items.some(w=>w.stock_code===filters.code))setFilters(previous=>({...previous,page:1,code:''}));
      setSelected(previous=>{if(!previous||!watch.items.some(w=>w.stock_code===previous.stock_code))return null;const current=list.items.find(r=>r.id===previous.id);return current?{...previous,...current}:previous;});
    }catch(e){if(!signal?.aborted&&version===epoch.current&&mounted.current)setError('公告暂时无法加载，请刷新重试。');}
    finally{if(version===epoch.current&&mounted.current)setLoading(false);}
  },[company,client,filters]);
  useEffect(()=>{
    if(!active)return;
    const abort=new AbortController();void refresh(abort.signal);
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(abort.signal);},10000);
    return()=>{abort.abort();clearInterval(timer);epoch.current++;};
  },[active,refresh]);
  async function act(operation:()=>Promise<unknown>){
    if(busy)return false;
    setBusy(true);setError('');
    try{await operation();if(mounted.current)await refresh();return true;}
    catch(error){if(mounted.current){
      const detail=apiErrorMessage(error);
      const messages:Record<string,string>={announcement_collect_paused:'自动采集已暂停，请联系管理员开启。',announcement_analyze_paused:'公告分析已暂停，请联系管理员开启。',announcement_personal_model_required:'分析待配置：需要个人模型账户。',only_followed_stocks_allowed:'只能采集或分析当前关注股票，请刷新后重试。'};
      setError(messages[detail]||'操作未完成，请重试。');
    }return false;}
    finally{if(mounted.current)setBusy(false);}
  }
  async function open(id:number){
    const version=++detailEpoch.current;setSelected(null);
    try{const row=await client.detail(company,id);if(version!==detailEpoch.current||!mounted.current)return;
      setSelected(row);void act(()=>client.state(company,id,{is_read:true}));
    }catch{if(version===detailEpoch.current&&mounted.current)setError('公告已不可访问，请刷新列表。');}
  }
  return {capabilities,watches,data,filters,setFilters,selected,setSelected,error,loading,busy,refresh,act,open};
}
