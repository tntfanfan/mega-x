import { useEffect, useRef, useState } from "react";
import { Upload, RotateCcw, X } from "lucide-react";
import type { Capabilities, SeriesApi, UploadResult } from "../api";

function uploadId(): string {
  // Public HTTP origins expose getRandomValues, but not randomUUID.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export type UploadEntry = { id: string; file: File; progress: number; state: "queued" | "uploading" | "done" | "failed"; error?: string; metadata: Record<string, string> };
export function useUploads(api: SeriesApi, projectId: string, onUploaded: (result: UploadResult) => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const controllers = useRef(new Map<string, AbortController>());
  const callback = useRef(onUploaded); callback.current = onUploaded;
  const active = useRef(projectId); active.current = projectId;
  const epoch = useRef(0);
  useEffect(() => {
    let alive = true;
    api.capabilities().then(c => { if (alive) setCaps(c); }).catch(() => { if (alive) setError("暂时无法读取上传限制，请稍后重试。"); });
    return () => { alive = false; };
  }, [api]);
  useEffect(() => {
    epoch.current += 1;
    setEntries([]);
    return () => { epoch.current += 1; controllers.current.forEach(c => c.abort()); controllers.current.clear(); };
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    for (const item of entries.filter(e => e.state === "queued")) {
      if (controllers.current.size >= 3) break;
      if (controllers.current.has(item.id)) continue;
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      const generation = epoch.current;
      const current = () => active.current === projectId && epoch.current === generation && !controller.signal.aborted;
      setEntries(list => list.map(e => e.id === item.id ? { ...e, state: "uploading" } : e));
      api.upload(projectId, item.file, { ...item.metadata, request_id: item.id }, n => {
        if (current()) setEntries(list => list.map(e => e.id === item.id ? { ...e, progress: n } : e));
      }, controller.signal).then(result => {
        if (!current()) return;
        callback.current(result);
        setEntries(list => list.map(e => e.id === item.id ? { ...e, state: "done", progress: 100 } : e));
      }).catch(err => {
        if (current()) setEntries(list => list.map(e => e.id === item.id ? { ...e, state: "failed", error: String(err.message || err) } : e));
      }).finally(() => { controllers.current.delete(item.id); });
    }
  }, [api, projectId, entries]);
  const add = (files: FileList | File[], metadata: Record<string, string> = {}) => {
    if (!projectId) { setError("请先选择项目，素材会保存在该项目中。"); return; }
    if (!caps) { setError("正在读取上传限制，请稍后再试。"); return; }
    const list = Array.from(files);
    if (!list.length) return;
    if (list.length > caps.uploads.batchMax) { setError(`每次最多上传 ${caps.uploads.batchMax} 个文件`); return; }
    if (metadata.material_id && list.length > 1) { setError("替换原文件时只能选择一个文件"); return; }
    for (const file of list) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      const category = /\.(png|jpe?g|webp)$/i.test(file.name) ? "image" : /\.(mp4|webm)$/i.test(file.name) ? "video" : /\.(md|txt)$/i.test(file.name) ? "text" : "archive";
      const max = caps.uploads.maxBytes[category];
      const error = !caps.uploads.extensions.includes(ext) ? "仅支持图片、视频、TXT / Markdown 和 ZIP" : file.size > max ? `单个文件不能超过 ${max / 1048576}MB` : !file.size ? "文件为空" : "";
      if (error) { setError(`${file.name}：${error}`); return; }
    }
    if (list.reduce((total, file) => total + file.size, 0) > caps.uploads.batchMaxBytes) { setError(`每次上传的文件合计不能超过 ${caps.uploads.batchMaxBytes / 1048576}MB`); return; }
    setError("");
    const batch = { ...metadata, batch_id: uploadId() };
    setEntries(old => [...old, ...list.map(file => ({ id: uploadId(), file, progress: 0, state: "queued" as const, metadata: batch }))]);
  };
  const remove = (id: string) => { controllers.current.get(id)?.abort(); controllers.current.delete(id); setEntries(list => list.filter(e => e.id !== id)); };
  const retry = (id: string) => setEntries(list => list.map(e => e.id === id ? { ...e, state: "queued", error: "", progress: 0 } : e));
  return { entries, caps, error, add, remove, retry, pending: entries.some(e => e.state !== "done") };
}
export type UploadQueue = ReturnType<typeof useUploads>;
export function UploadButton({ queue, disabled = false, label = "上传素材", metadata = {} }: { queue: UploadQueue; disabled?: boolean; label?: string; metadata?: Record<string, string> }) {
  const input = useRef<HTMLInputElement>(null);
  return <><input ref={input} type="file" multiple={!metadata.material_id} accept={queue.caps?.uploads.extensions.join(",")} className="hidden" aria-label="选择上传文件" onChange={e => { if (e.target.files) queue.add(e.target.files, metadata); e.target.value = ""; }} />
    <button type="button" disabled={disabled || !queue.caps} onClick={() => input.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg hover:bg-accent disabled:opacity-40"><Upload size={15} aria-hidden />{label}</button></>;
}
export function UploadProgress({ queue }: { queue: UploadQueue }) {
  return <div aria-live="polite" className="space-y-2 text-xs">
    {queue.error && <p role="alert" className="text-fusion">{queue.error}</p>}
    {queue.entries.map(e => <div key={e.id} className="rounded-lg border border-border-solid bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-body" title={e.file.name}>{e.file.name}</span>
        <span className={e.state === "failed" ? "text-fusion" : "text-muted"}>{e.state === "done" ? "已存入项目" : e.state === "failed" ? "上传失败" : e.state === "queued" ? "等待上传" : e.progress === 100 ? "正在保存…" : `${e.progress}%`}</span>
        {e.state === "failed" && <button type="button" aria-label={`重试 ${e.file.name}`} onClick={() => queue.retry(e.id)} className="p-1 text-primary"><RotateCcw size={13} /></button>}
        <button type="button" aria-label={`${e.state === "uploading" ? "取消上传" : "移除记录"} ${e.file.name}`} onClick={() => queue.remove(e.id)} className="p-1 text-muted hover:text-fusion"><X size={13} /></button></div>
      {e.error && <p role="alert" className="mt-1 text-fusion">{e.error}</p>}
      {e.state === "uploading" && <progress value={e.progress} max={100} aria-label={`${e.file.name} 上传进度`} className="mt-1 h-1 w-full accent-primary" />}
    </div>)}
  </div>;
}
