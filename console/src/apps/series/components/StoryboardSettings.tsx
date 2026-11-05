import { useState } from "react";
import type { ChatRef, ProjectStatus, StatusItem } from "../api";
import { GenerationDialog, fieldClass, primaryClass } from "./GenerationDialog";
export function StoryboardSettings({ status, item, onSend, onClose }: { status: ProjectStatus; item?: StatusItem; onSend: (text: string, refs: ChatRef[]) => boolean; onClose: () => void }) {
  const scripts = status.items.filter(i => i.kind === "script");
  const [episode, setEpisode] = useState(Number(item?.scope.episode || scripts[0]?.scope.episode || 1));
  const [representation, setRepresentation] = useState("text");
  const [layout, setLayout] = useState("single");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  return <GenerationDialog title={item ? "调整分镜形式" : "规划分镜"} onClose={onClose}><div className="space-y-4">
    {!item && <label className="block text-xs text-muted">剧本集数<select value={episode} onChange={e => setEpisode(Number(e.target.value))} className={fieldClass}>{scripts.map(s => <option key={s.logical} value={Number(s.scope.episode)}>第 {String(s.scope.episode)} 集</option>)}</select></label>}
    <fieldset><legend className="mb-2 text-sm text-heading">分镜形式</legend><div className="grid grid-cols-3 gap-2">{[["text","纯文字","先把画面、动作和对白写清楚"],["image","图片","以图片为主，保留必要说明"],["mixed","图文","对照查看图片和镜头说明"]].map(([key,label,hint]) => <label key={key} className={`cursor-pointer rounded-xl border p-3 ${representation === key ? "border-primary bg-primary/10" : "border-border-solid"}`}><input type="radio" name="representation" value={key} checked={representation === key} onChange={() => setRepresentation(key)} className="mr-2 accent-primary" /><span className="text-sm">{label}</span><span className="mt-2 block text-xs text-muted">{hint}</span></label>)}</div></fieldset>
    {representation !== "text" && <label className="block text-xs text-muted">图片布局<select value={layout} onChange={e => setLayout(e.target.value)} className={fieldClass}><option value="single">单画面</option><option value="four-panel">四格</option></select></label>}
    <label className="block text-xs text-muted">补充说明<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={fieldClass} placeholder="节奏、动作、运镜要求…" /></label>
    {error && <p role="alert" className="text-sm text-fusion">{error}</p>}<div className="flex justify-end"><button type="button" className={primaryClass} disabled={!item && !scripts.length} onClick={() => {
      const text = `${item ? `为这个镜头另存新版本` : `为第 ${episode} 集规划分镜` }。形式 representation=${representation}，布局 layout=${representation === "text" ? "continuous" : layout}。${representation === "text" ? "只写镜头说明，不生成图片。人物、地点和道具可绑定文字设定，无需补概念图。" : "按选定布局出图，并保留镜头编号、场次、时长和对白。"}对白来自剧本或我的输入，不凭图片编造。${notes}\n保存后形成镜头名单，纯文字镜头 image 留空。${item ? "检查已有视频的下游影响，保留旧版本。" : ""}`;
      if (onSend(text, item ? [{ ref: item.canonical || item.latest, project_id: status.project_id, label: item.label }] : [])) onClose(); else setError("当前对话忙碌或未连接，设置已保留，请稍后重试。");
    }}>确认分镜形式</button></div>
  </div></GenerationDialog>;
}
