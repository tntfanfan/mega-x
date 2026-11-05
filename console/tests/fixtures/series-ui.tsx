import { useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { seriesApi, refKey, type ChatRef, type ProjectStatus } from "../../src/apps/series/api";
import { Workspace } from "../../src/apps/series/components/Workspace";
import { ChatPane, type Draft } from "../../src/apps/series/components/ChatPane";
import type { TabId } from "../../src/apps/series/stages";
import "../../src/styles/globals.css";

function Acceptance() {
  const api = useMemo(() => seriesApi("/series-test-api"), []);
  const [status,setStatus] = useState<ProjectStatus | null>(null);
  const [project,setProject] = useState("demo");
  const [stage,setStage] = useState<TabId>("references");
  const [selected,setSelected] = useState("");
  const [draft,setDraft] = useState<Draft>({text:"",refs:[]});
  const [refresh,setRefresh] = useState(0);
  const [sent,setSent] = useState("");
  useEffect(() => { api.status(project).then(setStatus); },[project,api,refresh]);
  const addRef = (r: ChatRef) => setDraft(d => d.refs.some(x => refKey(x) === refKey(r)) ? d : {...d,refs:[...d.refs,r]});
  const send = (text: string, refs: ChatRef[]) => { setSent(JSON.stringify({text,refs})); return true; };
  return <div className="h-dvh bg-bg text-body" style={{ height: "100dvh" }}><header className="flex h-12 items-center gap-3 border-b border-border-solid px-4"><span className="font-medium text-heading">网剧工作台 · 验收项目</span><button onClick={() => { setProject(p => p === "demo" ? "other" : "demo"); setDraft({text:"",refs:[]}); setSelected(""); }}>切换测试项目</button><output data-testid="sent" className="hidden">{sent}</output></header>
    <div className="flex h-[calc(100vh-3rem)] flex-col md:flex-row" style={{ height: "calc(100dvh - 3rem)" }}><div className="flex min-h-0 w-full flex-1 md:w-[420px] md:flex-none"><ChatPane key={project} title="网剧主创" messages={[]} live={null} pending={[]} conn={{kind:"open"}} error="" busy={false} draft={draft} setDraft={setDraft} focusTick={0} status={status} sid="s1" mediaSrc={api.mediaSrc} onOpenRef={()=>{}} onSend={send} onAnswer={()=>true} onCancel={()=>{}} onRetry={()=>{}} onClearError={()=>{}} /></div>
    <Workspace key={project} onCreateProject={async()=>{setProject("demo");}} api={api} status={status} sessionId="s1" onGenerate={(text,ids)=>{ setSent(JSON.stringify({text,ids})); return true; }} view="structured" onView={()=>{}} filePath="" onFilePath={()=>{}} onStructured={()=>{}} stage={stage} onStage={s=>{setStage(s);setSelected("");}} selected={selected} onSelect={setSelected} onShow={i=>setSelected(i.logical)} onOpenFile={()=>{}} refreshKey={refresh} busy={false} connected onSend={send} onRef={addRef} onQuote={addRef} onOpen={()=>{}} onChanged={()=>setRefresh(n=>n+1)} onDirty={()=>{}} onSuggest={text=>setDraft(d=>({...d,text}))} />
  </div></div>;
}
createRoot(document.getElementById("root")!).render(<Acceptance />);
