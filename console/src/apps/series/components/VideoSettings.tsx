import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { refKey, type Capabilities, type ChatRef, type ProjectStatus, type ReferenceFile, type SeriesApi, type StatusItem, type VideoManifest, type VideoSelection } from "../api";
import { PURPOSE_LABEL, selectedRef } from "../generation";
import { itemRef, shortVersion } from "../stages";
import { GenerationDialog, fieldClass, primaryClass } from "./GenerationDialog";
import { ReferenceSelector } from "./ReferenceSelector";

const PRESETS = [["text", "只用分镜文字", "不发送任何视觉素材"], ["storyboard", "使用分镜图", "只选择本镜图片"], ["assets", "人物或资产图", "自己选择照片、概念图和环境图"], ["custom", "自定义组合", "自由组合文字、图片、音视频"]];
export function VideoSettings({ api, status, boards, sessionId, onGenerate, onClose, disabled }: { api: SeriesApi; status: ProjectStatus; boards: StatusItem[]; sessionId: string; onGenerate: (text: string, requests: string[]) => boolean; onClose: () => void; disabled: boolean }) {
  const initial = (b: StatusItem): VideoSelection => ({ storyboard: itemRef(b), preset: "text", use_storyboard_text: true, references: [], extra_text: "", parameters: { durationSeconds: Number(b.metadata?.duration_sec || 5), aspectRatio: String(status.items.find(i => i.kind === "bible")?.metadata?.aspect || "16:9"), resolution: "1080p" } });
  const [choices, setChoices] = useState<Record<string, VideoSelection>>(() => Object.fromEntries(boards.map(b => [b.logical, initial(b)])));
  const [included, setIncluded] = useState(boards.length > 20 ? [] : boards.map(b => b.logical));
  const [active, setActive] = useState(boards[0].logical);
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [previews, setPreviews] = useState<Record<string, VideoManifest> | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { let alive = true; Promise.all([api.references(status.project_id), api.capabilities()]).then(([f,c]) => { if (alive) { setFiles(f); setCaps(c); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [api, status.project_id]);
  const choice = choices[active];
  const board = boards.find(b => b.logical === active)!;
  const update = (part: Partial<VideoSelection>) => { setChoices(v => ({ ...v, [active]: { ...v[active], ...part } })); setPreviews(null); setSaved({}); setError(""); };
  const preset = (id: string) => {
    const images = files.filter(f => f.ref === choice.storyboard && f.mime?.startsWith("image/") && f.available);
    update({ preset: id, use_storyboard_text: true, references: id === "text" || id === "assets" ? [] : id === "storyboard" ? images.map(f => ({ ...selectedRef(f), purpose: "action" })) : choice.references });
  };
  const editRef = (index: number, change: Partial<ChatRef>) => update({ references: choice.references.map((r,i) => i === index ? { ...r, ...change } : r) });
  const move = (index: number, delta: number) => { const refs = [...choice.references]; [refs[index], refs[index+delta]] = [refs[index+delta], refs[index]]; update({ references: refs }); };
  const preview = async () => {
    if (included.length > 20) { setError("一次最多选择 20 个镜头，请分批生成。"); return; }
    setWorking(true); setError("");
    const results = await Promise.allSettled(included.map(key => api.previewVideo(status.project_id, choices[key])));
    if (!alive.current) return;
    const errors: string[] = [], values: Record<string, VideoManifest> = {};
    results.forEach((r,i) => { if (r.status === "fulfilled") values[included[i]] = r.value; else errors.push(`${boards.find(b => b.logical === included[i])?.label}：${r.reason?.message || "校验失败"}`); });
    if (errors.length) { setError(errors.join("\n")); setPreviews(null); } else setPreviews(values);
    setWorking(false);
  };
  const submit = async () => {
    if (!previews) return;
    setWorking(true); setError("");
    const requests = { ...saved };
    try {
      for (const key of included) {
        if (requests[key]) continue;
        const value = await api.saveVideo(status.project_id, { ...choices[key], session_id: sessionId, confirmation: "用户在视频参考面板核对了文字、参考文件、用途、角色绑定、顺序和参数，并点击确认生成。" });
        if (!alive.current) return;
        requests[key] = value.request_id!;
        setSaved({ ...requests });
      }
      if (onGenerate(`请按我在面板确认的 ${included.length} 个镜头输入快照生成视频，逐镜使用其 payload。成功项不要重复提交，失败项报告原因。`, included.map(key => requests[key]))) onClose();
      else setError("输入已保存。对话正在回复或连接中断，请稍后点击确认生成，设置不会丢失。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存输入失败，请重试"); }
    finally { setWorking(false); }
  };
  const profiles = status.items.filter(i => i.kind === "profile");
  return <GenerationDialog title={boards.length > 1 ? "批量生成视频 · 逐镜选择参考" : `生成视频 · ${board.label}`} onClose={onClose}><fieldset disabled={working} className="min-w-0">
    {boards.length > 20 && <p className="mb-3 text-xs text-muted">请选择本批镜头，一次最多 20 个，每镜都可单独设置参考。</p>}
    {boards.length > 1 && <div className="mb-4 flex flex-wrap gap-2">{boards.map(b => <div key={b.logical} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${active === b.logical ? "border-primary" : "border-border-solid"}`}><input type="checkbox" aria-label={`生成 ${b.label}`} checked={included.includes(b.logical)} onChange={e => { setIncluded(v => e.target.checked ? [...v,b.logical] : v.filter(k => k !== b.logical)); setPreviews(null); }} className="accent-primary" /><button type="button" onClick={() => setActive(b.logical)} className="text-xs">{b.label}</button></div>)}</div>}
    {previews ? <div className="space-y-4"><p className="text-sm text-heading">请核对本次实际输入</p>{included.map(key => { const p = previews[key]; return <div key={key} className="rounded-xl border border-border-solid p-4"><h3 className="text-sm font-medium text-heading">{boards.find(b => b.logical === key)?.label} · {shortVersion(p.storyboard)}</h3><p className="mt-1 text-xs text-muted">{p.payload.durationSeconds} 秒 · {p.payload.aspectRatio} · 图片 {p.payload.images.length} 张 · 视频 {p.payload.videos.length} 条 · 参考音频 {p.payload.audios.length} 条</p><ol className="mt-3 space-y-1 text-xs">{p.references.map((r,i) => <li key={refKey(r)}>{i+1}. {r.label || r.file} · {shortVersion(r.ref)} · {PURPOSE_LABEL[r.purpose || ""]} {r.asset_binding ? `· ${String(profiles.find(a => a.scope.asset_kind === r.asset_binding?.asset_kind && a.scope.slug === r.asset_binding?.slug)?.metadata?.name || r.asset_binding.slug)}` : ""}</li>)}</ol>{!p.references.length && <p className="mt-2 text-xs text-primary">仅使用文字，没有视觉参考。</p>}<details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">查看完整生成文字</summary><pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-surface-2 p-3 font-sans leading-relaxed">{p.payload.prompt}</pre></details></div>; })}</div> : <div className="space-y-5">
      <p className="text-xs text-muted">当前分镜 {shortVersion(choice.storyboard)}。选择的参考会按下方顺序发送，可随时移除或替换。</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{PRESETS.map(([id,label,hint]) => <button type="button" key={id} aria-pressed={choice.preset === id} onClick={() => preset(id)} className={`rounded-xl border p-3 text-left ${choice.preset === id ? "border-primary bg-primary/10" : "border-border-solid"}`}><span className="block text-sm text-heading">{label}</span><span className="mt-1 block text-xs text-muted">{hint}</span></button>)}</div>
      {choice.preset !== "text" && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={choice.use_storyboard_text} onChange={e => update({ use_storyboard_text: e.target.checked })} className="accent-primary" />采用本镜的文字说明与对白</label>
        {choice.preset === "storyboard" && !choice.references.length && <p className="text-xs text-fusion">这个版本没有分镜图片，请选择其他组合或先为分镜补图。</p>}
        {choice.preset !== "storyboard" && <ReferenceSelector api={api} projectId={status.project_id} selected={choice.references} onFiles={setFiles} onChange={references => update({ references, preset: "custom" })} />}
      </>}
      {!!choice.references.length && <section aria-label="已选参考顺序"><h3 className="mb-2 text-sm text-heading">已选参考 · {choice.references.length} 项</h3><ol className="space-y-2">{choice.references.map((r,i) => {
        const file = files.find(f => refKey(f) === refKey(r));
        return <li key={refKey(r)} className="rounded-xl border border-border-solid p-3"><div className="flex items-center gap-2"><span className="text-xs text-primary">{i+1}</span>{file?.mime?.startsWith("image/") && <img src={api.mediaSrc(file.url)} alt="" className="h-12 w-14 rounded object-contain" />}<span className="min-w-0 flex-1 truncate text-sm">{r.label || r.file}<span className="ml-2 text-xs text-muted">{shortVersion(r.ref)}</span></span><button type="button" aria-label={`上移参考 ${i+1}`} disabled={!i} onClick={() => move(i,-1)} className="p-1 disabled:opacity-20"><ArrowUp size={14} /></button><button type="button" aria-label={`下移参考 ${i+1}`} disabled={i === choice.references.length-1} onClick={() => move(i,1)} className="p-1 disabled:opacity-20"><ArrowDown size={14} /></button><button type="button" aria-label={`移除参考 ${i+1}`} onClick={() => update({ references: choice.references.filter((_,n) => n !== i) })} className="p-1 text-muted hover:text-fusion"><X size={14} /></button></div>
          <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[11px] text-muted">用途<select aria-label={`参考 ${i+1} 用途`} value={r.purpose || "style"} onChange={e => editRef(i, { purpose: e.target.value })} className={fieldClass}>{Object.entries(PURPOSE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="text-[11px] text-muted">对应角色或资产<select aria-label={`参考 ${i+1} 资产绑定`} value={r.asset_binding ? `${r.asset_binding.asset_kind}:${r.asset_binding.slug}` : ""} onChange={e => { const asset = profiles.find(p => `${p.scope.asset_kind}:${p.scope.slug}` === e.target.value); editRef(i, { asset_binding: asset ? { asset_kind: String(asset.scope.asset_kind), slug: String(asset.scope.slug), variant: "base" } : null }); }} className={fieldClass}><option value="">不绑定</option>{profiles.map(p => <option key={p.logical} value={`${p.scope.asset_kind}:${p.scope.slug}`}>{p.metadata?.name ? String(p.metadata.name) : p.label}</option>)}</select></label></div></li>;
      })}</ol></section>}
      <label className="block text-sm text-heading">补充生成说明<textarea rows={3} value={choice.extra_text} onChange={e => update({ extra_text: e.target.value })} className={fieldClass} placeholder="说明动作、运镜或要强调的细节…" /></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-xs text-muted">时长（秒）<input type="number" min={caps?.video.minSeconds || 4} max={caps?.video.maxSeconds || 15} step={1} value={choice.parameters.durationSeconds} onChange={e => update({ parameters: { ...choice.parameters, durationSeconds: Number(e.target.value) } })} className={fieldClass} /></label><label className="text-xs text-muted">画幅<select value={choice.parameters.aspectRatio} onChange={e => update({ parameters: { ...choice.parameters, aspectRatio: e.target.value } })} className={fieldClass}>{caps?.video.aspectRatios.map(r => <option key={r}>{r}</option>)}</select></label><label className="text-xs text-muted">清晰度<select value={choice.parameters.resolution} onChange={e => update({ parameters: { ...choice.parameters, resolution: e.target.value } })} className={fieldClass}>{caps?.video.resolutions.map(r => <option key={r}>{r}</option>)}</select></label><label className="text-xs text-muted">音频<select value={choice.parameters.audioMode || "native"} onChange={e => update({ parameters: { ...choice.parameters, audioMode: e.target.value } })} className={fieldClass}><option value="native">模型生成声音</option><option value="lock_source">使用驱动音轨</option><option value="remix_source">混合驱动音轨</option><option value="reference_only">参考驱动音轨</option></select></label></div>
      <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" checked={Boolean(choice.allow_draft)} onChange={e => update({ allow_draft: e.target.checked ? "用户在参考面板明确勾选允许使用所选草稿" : "" })} className="mt-0.5 accent-primary" />允许使用本次所选的草稿分镜或概念图（上传素材无需定稿）</label>
    </div>}
    {error && <p role="alert" className="mt-4 whitespace-pre-wrap text-sm text-fusion">{error}</p>}
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-solid pt-4"><button type="button" onClick={() => previews ? setPreviews(null) : onClose()} disabled={working} className="text-sm text-muted">{previews ? "返回调整" : "取消"}</button><button type="button" disabled={working || disabled || !caps || !included.length} onClick={() => void (previews ? submit() : preview())} className={primaryClass}>{working ? "正在校验和保存…" : previews ? `确认生成 ${included.length} 个镜头` : "下一步：核对实际输入"}</button></div>
  </fieldset></GenerationDialog>;
}
