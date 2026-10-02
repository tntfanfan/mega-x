import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipForward } from "lucide-react";
import { mediaPath } from "../../lib/projectBoard";
import type { BoardSnapshot } from "../../lib/projectBoard";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { rawUrl } from "../../lib/outputs";

export function FilmTimeline({ snapshot, scope, onNote }: { snapshot: BoardSnapshot; scope: WorkspaceScope; onNote: (shot: string, second: number, text: string) => Promise<unknown> }) {
  const { t } = useTranslation(), video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [note, setNote] = useState("");
  const segments = useMemo(() => {
    let cursor = 0;
    return snapshot.blocks.filter(b => b.meta.type === "shot" && b.meta.status !== "discarded").sort((a, b) => a.meta.scene.localeCompare(b.meta.scene) || a.meta.order - b.meta.order).map(shot => {
      const pkg = snapshot.blocks.find(b => b.meta.type === "package" && b.meta.id === shot.meta.video?.plan?.replace(/^package:/, "") && b.meta.shot_ids?.includes(shot.meta.id));
      const selected = shot.meta.selected_clip ?? pkg?.meta.selected_clip ?? shot.meta.selected_keyframe ?? shot.meta.selected;
      const media = snapshot.blocks.find(b => b.meta.id === selected);
      const fromPackage = pkg?.meta.selected_clip === selected && Boolean(selected);
      const trim = fromPackage && pkg.meta.segments?.find(s => s.shot === shot.meta.id);
      const packageReady = !fromPackage || Boolean(trim) && !["stale", "failed", "discarded"].includes(pkg.meta.status);
      const start = cursor; cursor += shot.meta.duration;
      return { shot, media, start, end: cursor, in: trim ? trim.in : shot.meta.trim_in ?? 0, packageReady };
    });
  }, [snapshot]);
  const duration = segments.at(-1)?.end ?? 0, current = segments.find(s => s.start <= time && s.end > time) ?? segments.at(-1);
  const keyframe = current?.media?.meta.type === "keyframe", valid = current?.media?.meta.file && current.packageReady && !["stale", "discarded", "failed", "generating"].includes(current.media.meta.status) && !["stale", "failed", "generating"].includes(current.shot.meta.status);
  const src = valid ? rawUrl(scope, mediaPath(snapshot.project.slug, current.media)) : "";
  useEffect(() => { setTime(0); setPlaying(false); }, [snapshot.project.slug]);
  useEffect(() => { setTime(old => Math.min(old, duration)); }, [duration]);
  useEffect(() => {
    if (!playing) return;
    let stamp = performance.now();
    const timer = window.setInterval(() => { const now = performance.now(), delta = (now - stamp) / 1000; stamp = now; setTime(old => Math.min(duration, old + delta)); }, 100);
    return () => window.clearInterval(timer);
  }, [playing, duration]);
  useEffect(() => { if (time >= duration && playing) setPlaying(false); }, [time, duration, playing]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.currentTime = Math.max(0, time - (current?.start ?? 0) + (current?.in ?? 0));
    if (playing) element.play().catch(() => setPlaying(false)); else element.pause();
  }, [src, playing, current?.shot.meta.id]);
  function seek(value: number) { const target = segments.find(s => s.start <= value && s.end > value) ?? segments.at(-1); setTime(value); if (video.current) video.current.currentTime = Math.max(0, value - (target?.start ?? 0) + (target?.in ?? 0)); }
  const line = current?.shot.meta.action ?? "";
  return <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
    <div className="flex min-h-48 flex-1 items-center justify-center rounded-lg bg-black/50">
      {valid ? keyframe ? <img src={src} alt={current.shot.meta.title} className="max-h-80 max-w-full object-contain" /> : <video ref={video} src={src} preload="auto" playsInline onLoadedMetadata={() => { if (video.current) { video.current.currentTime = Math.max(0, time - current.start + current.in); if (playing) video.current.play().catch(() => setPlaying(false)); } }} className="max-h-80 max-w-full object-contain" /> : <p className="p-4 text-muted">{t("film.media-missing")}</p>}
    </div>
    <div className="flex items-center gap-3 py-3"><button disabled={!duration} onClick={() => { if (time >= duration) setTime(0); setPlaying(v => !v); }} aria-label={t(playing ? "film.pause" : "film.play")} className="rounded bg-primary/15 p-2 text-primary">{playing ? <Pause size={16} /> : <Play size={16} />}</button><input type="range" aria-label={t("film.position")} min={0} max={duration} step={.1} value={time} onChange={e => seek(Number(e.target.value))} className="min-w-0 flex-1" /><span className="text-muted">{time.toFixed(1)} / {duration.toFixed(1)}s</span><button onClick={() => seek(current?.end ?? duration)} aria-label={t("film.next")}><SkipForward size={16} /></button></div>
    <div className="mb-3 flex gap-1 overflow-x-auto">{segments.map(s => <button key={s.shot.meta.id} onClick={() => seek(s.start)} style={{ flexBasis: Math.max(70, (s.end - s.start) * 16) }} className={`shrink-0 rounded border p-2 text-start ${s === current ? "border-primary text-primary" : "border-border-solid text-muted"}`}><div>{s.shot.meta.id}</div><div>{s.shot.meta.duration}s · {s.media?.meta.type === "keyframe" ? t("film.animatic") : t("film.type.clip")}</div></button>)}</div>
    <p className="mb-2 text-body">{current?.shot.meta.title} · {line}</p>
    <form onSubmit={async e => { e.preventDefault(); if (note.trim() && current && await onNote(current.shot.meta.id, time, note)) setNote(""); }} className="flex gap-2"><input aria-label={t("film.note")} value={note} onChange={e => setNote(e.target.value)} placeholder={t("film.note")} className="min-w-0 flex-1 rounded border border-border-solid bg-surface p-2" /><button disabled={!note.trim() || !current} className="text-primary">{t("film.add-note")}</button></form>
  </div>;
}
