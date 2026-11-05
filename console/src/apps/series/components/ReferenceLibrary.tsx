import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Search, Upload } from "lucide-react";
import type { ChatRef, ProjectStatus, SeriesApi, StatusItem } from "../api";
import { apiErrorMessage } from "../../../lib/api";
import { dragRef, isFileDrag } from "../drag";
import { shortVersion, timeLabel } from "../stages";
import { UploadButton, UploadProgress, useUploads } from "./Uploads";
import { PURPOSE_LABEL } from "../generation";

export function ReferenceLibrary({ api, status, onSelect, onRef, onChanged, onCreateProject, busy, children }: {
  api: SeriesApi; status: ProjectStatus | null; onSelect: (logical: string) => void; onRef: (ref: ChatRef) => void; onChanged: () => void;
  onCreateProject: (title: string) => Promise<void>; busy: boolean; children?: ReactNode;
}) {
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("auto");
  const [over, setOver] = useState(false);
  const [setup, setSetup] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queue = useUploads(api, status?.project_id || "", onChanged);
  const items = (status?.items || []).filter(i => i.kind === "reference" && (source === "all" || (i.metadata?.source_type || "research") === source) && `${i.label} ${i.metadata?.purpose || ""}`.toLowerCase().includes(query.toLowerCase()));
  const ref = (i: StatusItem): ChatRef => ({ ref: i.latest, file: i.file || undefined, purpose: String(i.metadata?.purpose || "style"), asset_binding: i.metadata?.asset_binding as ChatRef["asset_binding"], label: i.label, project_id: status?.project_id });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || busy || !title.trim()) return;
    setSaving(true); setError("");
    try { await onCreateProject(title.trim()); }
    catch (e) { setError(apiErrorMessage(e, "创建项目失败，请重试")); }
    finally { setSaving(false); }
  };
  return <section aria-label="参考素材库" className={`flex min-h-0 flex-1 flex-col ${over ? "bg-primary/10" : ""}`}
    onDragOver={e => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = status ? "copy" : "none"; setOver(Boolean(status)); } }} onDragLeave={() => setOver(false)}
    onDrop={e => { if (!isFileDrag(e)) return; e.preventDefault(); setOver(false); if (!status) { setSetup(true); return; } queue.add(e.dataTransfer.files, { ...(purpose === "auto" ? {} : { purpose }) }); }}>
    <div className="shrink-0 px-4 pt-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium text-heading">项目参考素材</h2><p className="mt-1 text-xs text-muted">{status ? "上传后长期保存在当前项目，随时加入对话或选作生成参考。" : "先创建一个项目来保存素材，然后选择要上传的文件。"}</p></div>
      {status ? <UploadButton queue={queue} metadata={{ ...(purpose === "auto" ? {} : { purpose }) }} /> : <button type="button" onClick={() => setSetup(true)} disabled={busy || saving} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg hover:bg-accent disabled:opacity-40"><Upload size={15} aria-hidden />上传素材</button>}
    </div>
    {!status && setup && <form onSubmit={create} className="mb-4 rounded-xl border border-border-solid bg-surface-2 p-3">
      <label className="block text-xs text-muted">项目名称<input autoFocus required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="给这部剧起个暂定名" className="mt-1 w-full rounded-lg border border-border-solid bg-surface px-3 py-2 text-sm text-heading outline-none focus:border-primary" /></label>
      <div className="mt-3 flex items-center justify-end gap-2"><button type="button" disabled={saving} onClick={() => setSetup(false)} className="px-3 py-2 text-xs text-muted">取消</button><button type="submit" disabled={busy || saving || !title.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-bg disabled:opacity-40">{saving && <LoaderCircle size={13} className="animate-spin" />}{saving ? "创建中…" : "创建项目，继续上传"}</button></div>
      {error && <p role="alert" className="mt-2 text-xs text-fusion">{error}</p>}
    </form>}
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
      {status && <label className="flex items-center gap-2 text-muted">上传用途<select aria-label="上传素材用途" value={purpose} onChange={e => setPurpose(e.target.value)} className="rounded border border-border-solid bg-surface-2 p-1.5 text-body"><option value="auto">按文件类型</option>{Object.entries(PURPOSE_LABEL).filter(([key]) => !key.endsWith("audio")).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      <span className="text-dim">{queue.caps ? `每次最多 ${queue.caps.uploads.batchMax} 个，合计 ≤${queue.caps.uploads.batchMaxBytes / 1048576}MB；单个图片 ≤${queue.caps.uploads.maxBytes.image / 1048576}MB · 视频 ≤${queue.caps.uploads.maxBytes.video / 1048576}MB · 文字 ≤${queue.caps.uploads.maxBytes.text / 1048576}MB · ZIP ≤${queue.caps.uploads.maxBytes.archive / 1048576}MB` : "正在读取上传限制…"}</span>
    </div>
    <p className="mb-3 text-xs text-dim">PNG / JPEG / WebP · MP4 / WebM · TXT / Markdown · ZIP（按原文件保存）</p>
    <div className="mb-3 max-h-36 overflow-y-auto"><UploadProgress queue={queue} /></div>
    </div>
    {children ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
    {status && <div className="mb-4 flex flex-wrap items-center gap-2"><div className="flex gap-1 rounded-lg bg-surface-2 p-1">{[["all","全部"],["upload","用户上传"],["research","检索资料"]].map(([k,v]) => <button key={k} type="button" aria-pressed={source === k} onClick={() => setSource(k)} className={`rounded-md px-3 py-1.5 text-xs ${source === k ? "bg-surface-3 text-heading" : "text-muted"}`}>{v}</button>)}</div>
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-solid px-2 py-1.5"><Search size={14} className="text-muted" /><input aria-label="搜索参考素材" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称…" className="min-w-0 w-full bg-transparent text-sm text-heading outline-none" /></label></div>}
    {!items.length && <div className="rounded-xl border-2 border-dashed border-border-solid p-10 text-center text-sm text-muted">{!status ? "点击右上角“上传素材”，创建项目后即可上传。" : query ? "没有匹配的素材" : "把文件拖到这里，或点击“上传素材”"}</div>}
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">{items.map(item => <li key={item.logical} className="overflow-hidden rounded-xl border border-border-solid bg-surface">
      <button type="button" onClick={() => onSelect(item.logical)} draggable onDragStart={e => dragRef(e, ref(item))} className="w-full text-left">
        <div className="flex aspect-[4/3] items-center justify-center bg-surface-2">{item.thumb ? <img src={api.mediaSrc(item.thumb)} alt={item.label} className="h-full w-full object-contain" loading="lazy" /> : <span className="text-muted">{item.metadata?.mime === "application/zip" ? "ZIP 素材包" : item.media_kind === "video" ? "视频素材" : String(item.metadata?.mime || "").startsWith("text/") ? "文字素材" : "参考资料"}</span>}</div>
        <div className="p-3"><p className="truncate text-sm text-heading" title={item.label}>{item.label}</p><p className="mt-1 text-xs text-muted">{PURPOSE_LABEL[String(item.metadata?.purpose || "")] || "参考资料"} · {shortVersion(item.latest)}</p><p className="mt-1 text-[11px] text-dim">{timeLabel(String(item.metadata?.uploaded_at || ""))}</p></div>
      </button><div className="flex items-center justify-between px-3 pb-3 text-xs"><span className={item.availability === "available" ? "text-spark-mint" : "text-fusion"}>{item.availability === "deprecated" ? "已弃用" : item.availability === "unavailable" ? "文件不可用" : "可用"}</span><button type="button" disabled={item.availability !== "available"} onClick={() => onRef(ref(item))} className="rounded border border-border-solid px-2 py-1 text-primary disabled:opacity-40">加入对话</button></div>
    </li>)}</ul>
    </div>}
  </section>;
}
