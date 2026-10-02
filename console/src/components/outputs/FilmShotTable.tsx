import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaPath } from "../../lib/projectBoard";
import type { BoardBlock, BoardSnapshot } from "../../lib/projectBoard";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { rawUrl } from "../../lib/outputs";

type Change = (op: string, id?: string, args?: Record<string, unknown>) => Promise<boolean>;
function ShotRow({ shot, snapshot, scope, change, onOpen }: { shot: BoardBlock; snapshot: BoardSnapshot; scope: WorkspaceScope; change: Change; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ action: shot.meta.action, size: shot.meta.size, duration: shot.meta.duration });
  const [version, setVersion] = useState(shot.meta.version), [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) { setDraft({ action: shot.meta.action, size: shot.meta.size, duration: shot.meta.duration }); setVersion(shot.meta.version); } }, [shot.meta.version, dirty]);
  const children = snapshot.blocks.filter(b => b.meta.parent === shot.meta.id && b.meta.file);
  const chosen = snapshot.blocks.find(b => b.meta.id === (shot.meta.selected_clip ?? shot.meta.selected_keyframe));
  const input = "w-full rounded border border-border-solid bg-bg px-2 py-1";
  const usable = (b: BoardBlock) => !["stale", "discarded", "failed", "generating"].includes(b.meta.status);
  return <tr className="border-b border-border-solid align-top">
    <td className="w-28 p-2">{chosen?.meta.file && (chosen.meta.type === "clip" ? <video src={rawUrl(scope, mediaPath(snapshot.project.slug, chosen))} preload="metadata" controls className="w-28 rounded" /> : <img src={rawUrl(scope, mediaPath(snapshot.project.slug, chosen))} alt={shot.meta.title} className="w-28 rounded" />)}<button onClick={() => onOpen(shot.meta.id)} className="mt-2 text-start text-primary">{shot.meta.id}</button><p className="mt-1 text-muted">{shot.meta.family} · {t(`film.status.${shot.meta.status}`)}</p></td>
    <td className="w-24 p-2"><input aria-label={`${shot.meta.id} ${t("film.duration")}`} type="number" min=".1" max="3600" step=".1" value={draft.duration} onChange={e => { setDirty(true); setDraft(d => ({ ...d, duration: Number(e.target.value) })); }} className={input} /><select aria-label={`${shot.meta.id} ${t("film.size")}`} value={draft.size} onChange={e => { setDirty(true); setDraft(d => ({ ...d, size: e.target.value })); }} className={`mt-2 ${input}`}>{["ELS", "LS", "FS", "MS", "MCU", "CU", "ECU", "OTS", "POV"].map(s => <option key={s}>{s}</option>)}</select><p className="mt-2 text-muted">{shot.meta.movement}</p></td>
    <td className="min-w-48 p-2"><textarea aria-label={`${shot.meta.id} ${t("film.action")}`} value={draft.action} onChange={e => { setDirty(true); setDraft(d => ({ ...d, action: e.target.value })); }} rows={3} className={input} />{dirty && <button onClick={async () => { const op = shot.meta.locked || ["approved", "locked", "stale"].includes(shot.meta.status) ? "revise" : "update"; if (await change(op, shot.meta.id, { patch: draft, options: { expectedVersion: version } })) setDirty(false); }} className="mt-1 text-primary">{t("film.save")}</button>}</td>
    <td className="min-w-40 p-2"><p className="whitespace-pre-wrap text-body">{(shot.meta["dialogue"] as { speaker: string; line: string }[] | undefined)?.map(d => `${d.speaker}: ${d.line}`).join("\n")}</p></td>
    <td className="w-48 p-2">{(["keyframe", "clip"] as const).map(kind => <label key={kind} className="mb-2 block text-muted">{t(`film.type.${kind}`)}<select aria-label={`${shot.meta.id} ${t(`film.type.${kind}`)}`} value={kind === "keyframe" ? shot.meta.selected_keyframe ?? "" : shot.meta.selected_clip ?? ""} onChange={e => change("select", shot.meta.id, { child: e.target.value, options: { expectedVersion: shot.meta.version } })} className={`mt-1 ${input}`}><option value="" disabled>—</option>{children.filter(b => b.meta.type === kind).map(b => <option key={b.meta.id} value={b.meta.id} disabled={!usable(b)}>{b.meta.title} · v{b.meta.version}{usable(b) ? "" : ` · ${t(`film.status.${b.meta.status}`)}`}</option>)}</select></label>)}</td>
  </tr>;
}
export function FilmShotTable({ snapshot, scope, change, onOpen }: { snapshot: BoardSnapshot; scope: WorkspaceScope; change: Change; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const shots = snapshot.blocks.filter(b => b.meta.type === "shot" && b.meta.status !== "discarded").sort((a, b) => a.meta.scene.localeCompare(b.meta.scene) || a.meta.order - b.meta.order);
  return <div className="min-w-0 flex-1 overflow-auto"><table className="w-full min-w-[780px] border-collapse text-xs"><thead className="sticky top-0 z-10 bg-surface text-start text-muted"><tr>{["shot", "specs", "action", "dialogue", "candidates"].map(key => <th key={key} className="border-b border-border-solid p-2 text-start font-medium">{t(`film.${key}`)}</th>)}</tr></thead><tbody>{shots.map(shot => <ShotRow key={shot.meta.id} shot={shot} snapshot={snapshot} scope={scope} change={change} onOpen={onOpen} />)}</tbody></table>{!shots.length && <p className="p-4 text-muted">{t("film.no-shots")}</p>}</div>;
}
