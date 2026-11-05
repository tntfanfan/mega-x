import { useEffect, useState } from "react";
import type { Capabilities, ChatRef, ProjectStatus, SeriesApi, StatusItem } from "../api";
import { LAYOUTS } from "../generation";
import { GenerationDialog, fieldClass, primaryClass } from "./GenerationDialog";
import { ReferenceSelector } from "./ReferenceSelector";

export function ConceptSettings({ api, status, item, onSend, onClose }: { api: SeriesApi; status: ProjectStatus; item: StatusItem; onSend: (text: string, refs: ChatRef[]) => boolean; onClose: () => void }) {
  const options = LAYOUTS[String(item.scope.asset_kind)] || LAYOUTS.character;
  const profile = status.items.find(p => p.kind === "profile" && p.scope.asset_kind === item.scope.asset_kind && p.scope.slug === item.scope.slug);
  const assetName = String(profile?.metadata?.name || item.metadata?.name || item.label);
  const [layouts, setLayouts] = useState([options[0].id]);
  const [style, setStyle] = useState("inherit");
  const [aspect, setAspect] = useState("auto");
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<ChatRef[]>([]);
  const [notes, setNotes] = useState("");
  const [customViews, setCustomViews] = useState("");
  const [fourViews, setFourViews] = useState("face");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.capabilities().then(setCaps).catch(() => setError("无法读取图片能力，请稍后重试")); }, [api]);
  const entries = options.filter(l => layouts.includes(l.id)).flatMap(l => Array.from({ length: count }, (_, i) => ({
    id: `${l.id}:${i}`, label: `${assetName} · ${l.label} · 候选 ${i + 1}`, layout: l.id,
    concept_key: l.id + (style === "inherit" ? "" : `-${style}`), views: l.id === "custom" ? customViews.split(/[，,、]/).map(v => v.trim()).filter(Boolean) : l.id === "four-view" && fourViews === "around" ? ["正面全身", "右侧全身", "背面全身", "左侧全身"] : l.views,
    framing: l.framing, style_id: style, aspect_ratio: aspect === "auto" ? l.aspect : aspect, candidate: i + 1,
  })));
  const selected = entries.filter(e => !excluded.includes(e.id));
  const generate = () => {
    if (layouts.includes("custom") && !customViews.trim()) { setError("请写明自定义图式的具体视角"); return; }
    if (style === "custom" && !notes.trim()) { setError("请在补充说明中描述想要的画风"); return; }
    const text = `为 ${item.scope.slug} 生成以下概念图。造型：${item.scope.variant || "base"}。每个图式独立保存并分别管理候选版本。画风仅用于本次候选，继承时读取项目画风，不改变项目设定。\n生成条目：\n${JSON.stringify(selected.map(({ id, ...e }) => e), null, 2)}\n补充说明：${notes || "无"}\n仅使用消息所选文件作为参考；先按所选图式检查图片能力和具体视角，再生成、检查和发布。`;
    if (onSend(text, [{ ref: item.canonical || item.latest, label: item.label, project_id: status.project_id }, ...refs])) onClose();
    else setError("当前对话正在回复或连接中断，设置已保留，请稍后重试。");
  };
  return <GenerationDialog title={`生成概念图 · ${assetName}`} onClose={onClose}><div className="space-y-5">
    <fieldset><legend className="mb-2 text-sm font-medium text-heading">选择图式（可多选）</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{options.map(o => <label key={o.id} className={`cursor-pointer rounded-xl border p-3 ${layouts.includes(o.id) ? "border-primary bg-primary/10" : "border-border-solid"}`}><span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={layouts.includes(o.id)} onChange={e => setLayouts(list => e.target.checked ? [...list, o.id] : list.filter(k => k !== o.id))} className="accent-primary" />{o.label}</span><span className="mt-1 block text-[11px] leading-relaxed text-muted">{o.views.join("、") || "自行指定视角和构图"}</span></label>)}</div></fieldset>
    {layouts.includes("custom") && <label className="block text-xs text-muted">具体视角（用逗号分隔）<input value={customViews} onChange={e => setCustomViews(e.target.value)} className={fieldClass} placeholder="例如：左前方、俯视、手部细节" /></label>}
    {layouts.includes("four-view") && item.scope.asset_kind === "character" && <label className="block text-xs text-muted">四视图视角组合<select value={fourViews} onChange={e => setFourViews(e.target.value)} className={fieldClass}><option value="face">脸部特写 + 正面、侧面、背面全身</option><option value="around">正面、右侧、背面、左侧全身</option></select></label>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs text-muted">画风<select value={style} onChange={e => setStyle(e.target.value)} className={fieldClass}><option value="inherit">继承项目画风</option><option value="realistic">写实</option><option value="anime">动漫</option><option value="watercolor">水彩</option><option value="custom">自定义（补充说明）</option></select></label><label className="text-xs text-muted">画幅<select value={aspect} onChange={e => setAspect(e.target.value)} className={fieldClass}><option value="auto">按图式推荐</option>{caps?.image.aspectRatios.map(r => <option key={r}>{r}</option>)}</select></label><label className="text-xs text-muted">每种图式候选数<select value={count} onChange={e => setCount(Number(e.target.value))} className={fieldClass}>{[1,2,3,4].map(n => <option key={n} value={n}>{n} 张</option>)}</select></label></div>
    <details><summary className="cursor-pointer text-sm text-heading">选择参考图片（已选 {refs.length} 张）</summary><div className="mt-2"><ReferenceSelector api={api} projectId={status.project_id} imagesOnly selected={refs} onChange={setRefs} /></div></details>
    <label className="block text-sm text-heading">补充说明<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={fieldClass} placeholder="服装、表情、构图或自定义画风…" /></label>
    <fieldset className="rounded-xl bg-surface-2 p-3"><legend className="px-1 text-sm text-heading">本次生成 {selected.length} 张</legend><div className="max-h-44 space-y-2 overflow-y-auto">{entries.map(e => <label key={e.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!excluded.includes(e.id)} onChange={ev => setExcluded(v => ev.target.checked ? v.filter(k => k !== e.id) : [...v, e.id])} className="accent-primary" /><span className="flex-1">{e.label}</span><span className="text-muted">{e.aspect_ratio}</span></label>)}</div></fieldset>
    {caps && refs.length > caps.image.maxImages && <p role="alert" className="text-sm text-fusion">最多选择 {caps.image.maxImages} 张参考图，目前已选 {refs.length} 张，请移除多余参考。</p>}
    {error && <p role="alert" className="text-sm text-fusion">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="text-sm text-muted">取消</button><button type="button" onClick={generate} disabled={!caps || !selected.length || refs.length > (caps?.image.maxImages || 0)} className={primaryClass}>生成 {selected.length} 张概念图</button></div>
  </div></GenerationDialog>;
}
