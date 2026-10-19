import { isVideo, type MediaItem } from "../api";

/** Images / videos of a reply or a version; `pick` makes each a selectable candidate card. */
export function MediaGrid({ media, src, large = false, pickedUrl, onPick }: {
  media: MediaItem[];
  src: (url: string) => string;
  large?: boolean;
  pickedUrl?: string;
  onPick?: (item: MediaItem, index: number) => void;
}) {
  if (!media.length) return null;
  return (
    <div className={`mt-2 grid gap-2 ${large ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
      {media.map((item, index) => {
        const url = src(item.url);
        const picked = pickedUrl === item.url;
        return (
          <figure key={item.url} className={`relative overflow-hidden rounded-md border bg-surface ${picked ? "border-primary ring-1 ring-primary" : "border-border-solid"}`}>
            {isVideo(item)
              ? <video src={url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
              : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`候选 ${index + 1}`} loading="lazy" className="aspect-square w-full object-cover" /></a>}
            <figcaption className="flex items-center justify-between px-2 py-1 text-[11px] text-muted">
              <span>#{index + 1}</span>
              {onPick && <button type="button" onClick={() => onPick(item, index)} className="text-primary hover:underline">{picked ? "已选" : "选这张"}</button>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
