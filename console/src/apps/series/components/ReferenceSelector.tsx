import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { refKey, type ChatRef, type ReferenceFile, type SeriesApi } from "../api";
import { inputIssue, selectedRef } from "../generation";
import { shortVersion } from "../stages";

export function ReferenceSelector({ api, projectId, selected, onChange, onFiles, imagesOnly = false }: { api: SeriesApi; projectId: string; selected: ChatRef[]; onChange: (refs: ChatRef[]) => void; onFiles?: (files: ReferenceFile[]) => void; imagesOnly?: boolean }) {
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => { let alive = true; api.references(projectId).then(r => { if (alive) { setFiles(r); onFiles?.(r); setError(""); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [api, projectId, onFiles]);
  const shown = files.filter(f => (!imagesOnly || f.mime?.startsWith("image/")) && (filter === "all" || (filter === "upload" ? f.source_type === "upload" : f.kind === filter)) && `${f.label} ${f.file}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="rounded-xl border border-border-solid bg-surface/50 p-3">
    <div className="flex flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2"><Search size={14} className="text-muted" /><input aria-label="搜索可选参考" placeholder="搜索素材、角色或图式…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 w-full bg-transparent p-1 text-sm outline-none" /></label></div>
    <p className="mt-2 text-xs text-muted">新增文件请先在「参考素材」中上传。</p>
    <div className="my-2 flex flex-wrap gap-2 text-xs">{[["all","全部"],["upload","上传素材"],["concept","概念图"],["storyboard","分镜图"]].map(([k,v]) => <button type="button" key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-2.5 py-1 ${filter === k ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface-2"}`}>{v}</button>)}</div>
    {error && <p role="alert" className="text-xs text-fusion">{error}</p>}
    <div className="max-h-60 space-y-1 overflow-y-auto">{!shown.length && <p className="p-3 text-center text-xs text-muted">暂无匹配的参考，请先在「参考素材」中上传。</p>}{shown.map(f => {
      const key = refKey(f), checked = selected.some(r => refKey(r) === key), issue = inputIssue(f, imagesOnly);
      return <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 ${checked ? "border-primary bg-primary/5" : "border-transparent hover:bg-surface-2"} ${issue ? "opacity-50" : ""}`}>
        <input type="checkbox" checked={checked} disabled={Boolean(issue)} onChange={() => onChange(checked ? selected.filter(r => refKey(r) !== key) : [...selected, selectedRef(f)])} className="h-4 w-4 accent-primary" />
        {f.mime?.startsWith("image/") ? <img src={api.mediaSrc(f.url)} alt="" loading="lazy" className="h-12 w-14 rounded bg-surface-2 object-contain" /> : <span className="w-14 text-center text-xs text-muted">{f.mime?.startsWith("video/") ? "视频" : f.mime?.startsWith("audio/") ? "音频" : "文档"}</span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm text-heading">{f.label}</span><span className="block text-[11px] text-muted">{shortVersion(f.ref)} · {f.source_type === "upload" ? "用户上传" : f.kind === "concept" ? "概念图" : f.kind === "storyboard" ? "分镜图" : "检索资料"} · {f.kind === "reference" ? "素材可用" : f.status === "canonical" ? "定稿" : "草稿"}{issue && ` · ${issue}`}</span><span className="block truncate text-[10px] text-dim" title={f.file}>{f.file.split("/").pop()}</span></span>{checked && <Check size={14} className="text-primary" />}
      </label>;
    })}</div>
  </div>;
}
