import type { ChatRef, ProjectStatus, SeriesApi, VideoManifest } from "../api";
import { PURPOSE_LABEL } from "../generation";
import { shortVersion } from "../stages";

export function GenerationRecord({ value, api, status, onRef }: { value: VideoManifest; api: SeriesApi; status: ProjectStatus | null; onRef: (ref: ChatRef) => void }) {
  return <section aria-label="本次视频的生成输入" className="mx-auto mb-4 max-w-3xl rounded-xl border border-border-solid p-4">
    <h3 className="text-sm font-medium text-heading">本次视频使用的输入</h3>
    <p className="mt-1 text-xs text-muted">分镜 {shortVersion(value.storyboard)} · {value.payload.durationSeconds} 秒 · {value.payload.aspectRatio} · 图片 {value.payload.images.length} 张 · 视频 {value.payload.videos.length} 条{value.payload.driveAudio ? " · 含驱动音轨" : ""}</p>
    {!value.references.length && <p className="mt-3 text-xs text-primary">仅使用分镜文字，没有视觉参考。</p>}
    <ol className="mt-3 space-y-2">{value.references.map((r, i) => {
      const who = r.asset_binding && status?.items.find(a => a.kind === "profile" && a.scope.asset_kind === r.asset_binding?.asset_kind && a.scope.slug === r.asset_binding?.slug);
      return <li key={`${r.ref}:${r.file}`} className="flex items-center gap-3 text-xs">
        <span className="text-muted">{i + 1}</span>{r.input_type === "images" && r.url && <img src={api.mediaSrc(r.url)} alt="" className="h-12 w-14 rounded bg-surface-2 object-contain" />}
        <div className="min-w-0 flex-1"><p className="truncate text-heading">{r.label || r.file} · {shortVersion(r.ref)}</p><p className="mt-1 text-muted">{PURPOSE_LABEL[r.purpose || ""]}{r.asset_binding ? ` · ${String(who?.metadata?.name || r.asset_binding.slug)}` : ""}</p></div>
        <button type="button" onClick={() => onRef(r)} className="shrink-0 rounded border border-border-solid px-2 py-1 text-primary">加入对话</button>
      </li>;
    })}</ol>
    <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">查看生成文字</summary><p className="mt-2 whitespace-pre-wrap rounded bg-surface-2 p-3 leading-relaxed">{value.payload.prompt}</p></details>
  </section>;
}
