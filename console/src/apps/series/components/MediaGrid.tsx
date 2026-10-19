import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { isVideo, type ChatRef, type MediaItem } from "../api";
import { dragRef } from "../drag";
import { isTyping } from "./bits";

/**
 * Images / videos of a reply or a version. Click an image = look at it large (←/→ to flip, Esc to close);
 * each one can be dragged into the chat. `onPick` makes them selectable candidates.
 */
export function MediaGrid({ media, src, large = false, pickedUrl, onPick, refOf }: {
  media: MediaItem[];
  src: (url: string) => string;
  large?: boolean;
  pickedUrl?: string;
  onPick?: (item: MediaItem, index: number) => void;
  /** What dragging item `index` into the chat references. */
  refOf?: (item: MediaItem, index: number) => ChatRef;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  const single = media.length === 1;
  return (
    <>
      <div className={`mt-2 grid gap-2 ${single ? "grid-cols-1" : large ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"} ${single && !large ? "max-w-sm" : ""}`}>
        {media.map((item, index) => {
          const url = src(item.url);
          const picked = pickedUrl === item.url;
          const ref = refOf?.(item, index);
          return (
            <figure key={item.url} draggable={Boolean(ref)} onDragStart={ref ? e => dragRef(e, ref) : undefined}
              className={`group relative overflow-hidden rounded-lg border bg-surface ${picked ? "border-primary ring-1 ring-primary" : "border-border-solid"}`}>
              {isVideo(item)
                ? <video src={url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
                : (
                  <button type="button" onClick={() => setOpen(index)} className="block w-full cursor-zoom-in" aria-label={`看大图 ${index + 1}`}>
                    <img src={url} alt={`候选 ${index + 1}`} loading="lazy" draggable={false}
                      className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${single ? "max-h-96 object-contain bg-black/40" : "aspect-square"}`} />
                    <Maximize2 size={14} aria-hidden className="absolute end-2 top-2 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
              {(onPick || media.length > 1) && (
                <figcaption className="flex items-center justify-between px-2 py-1 text-[11px] text-muted">
                  <span className="tabular-nums">#{index + 1}</span>
                  {onPick && <button type="button" onClick={() => onPick(item, index)} className="text-primary hover:underline">{picked ? "已选" : "选这张"}</button>}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
      {open !== null && (
        <Lightbox media={media} index={open} src={src} onIndex={setOpen} onClose={() => setOpen(null)}
          onPick={onPick ? (item, i) => { onPick(item, i); setOpen(null); } : undefined} refOf={refOf} />
      )}
    </>
  );
}

function Lightbox({ media, index, src, onIndex, onClose, onPick, refOf }: {
  media: MediaItem[];
  index: number;
  src: (url: string) => string;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPick?: (item: MediaItem, index: number) => void;
  refOf?: (item: MediaItem, index: number) => ChatRef;
}) {
  const images = media.map((m, i) => ({ m, i })).filter(x => !isVideo(x.m));
  const at = Math.max(0, images.findIndex(x => x.i === index));
  const go = (step: number) => { if (images.length) onIndex(images[(at + step + images.length) % images.length].i); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowLeft") { e.stopPropagation(); go(-1); }
      else if (e.key === "ArrowRight") { e.stopPropagation(); go(1); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const item = media[index];
  const ref = refOf?.(item, index);
  return (
    <div role="dialog" aria-modal="true" aria-label="看大图" onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-4 animate-in fade-in">
      <img src={src(item.url)} alt={`第 ${index + 1} 张`} onClick={e => e.stopPropagation()}
        draggable={Boolean(ref)} onDragStart={ref ? e => dragRef(e, ref) : undefined}
        className="max-h-[80vh] max-w-full rounded-md object-contain shadow-2xl" />
      <div onClick={e => e.stopPropagation()} className="mt-3 flex items-center gap-3 text-sm text-white/80">
        {images.length > 1 && <button type="button" onClick={() => go(-1)} aria-label="上一张" className="rounded-full p-1.5 hover:bg-white/10"><ChevronLeft size={18} aria-hidden /></button>}
        <span className="tabular-nums">{at + 1} / {images.length}</span>
        {images.length > 1 && <button type="button" onClick={() => go(1)} aria-label="下一张" className="rounded-full p-1.5 hover:bg-white/10"><ChevronRight size={18} aria-hidden /></button>}
        {onPick && <button type="button" onClick={() => onPick(item, index)} className="ms-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg">选这张</button>}
        {ref && <span className="text-xs text-white/50">拖到对话 = 引用</span>}
      </div>
      <button type="button" onClick={onClose} aria-label="关闭" className="absolute end-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"><X size={20} aria-hidden /></button>
    </div>
  );
}
