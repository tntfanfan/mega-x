import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReactFlow, Background, Controls, Handle, Position, applyNodeChanges } from "@xyflow/react";
import type { Node, NodeProps, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Lock, Pencil, RefreshCw, X } from "lucide-react";
import { apiErrorMessage } from "../../lib/api";
import { fetchBoard, listProjects, mediaPath, mutateBoard } from "../../lib/projectBoard";
import type { BoardBlock, BoardSnapshot } from "../../lib/projectBoard";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import { rawUrl } from "../../lib/outputs";
import { Markdown } from "../ui/Markdown";
import { FilmTimeline } from "./FilmTimeline";
import { FilmShotTable } from "./FilmShotTable";

const imageTypes = new Set(["sheet", "keyframe", "reference"]);
const assets = new Set(["character", "location", "prop", "sheet", "reference", "audio"]);
const bad = new Set(["stale", "failed", "discarded", "generating"]);
type CardData = { block: BoardBlock; scope: WorkspaceScope; slug: string; selected?: BoardBlock; label: string; state: string };
type CardNode = Node<CardData, "film">;
function Thumbnail({ scope, slug, block }: { scope: WorkspaceScope; slug: string; block?: BoardBlock }) {
  if (!block?.meta.file) return null;
  const url = rawUrl(scope, mediaPath(slug, block));
  if (block.meta.type === "clip" || block.meta.type === "deliverable" && /\.(mp4|mov|webm)$/i.test(block.meta.file)) return <video src={url} controls preload="metadata" className="nodrag nowheel max-h-48 w-full rounded object-contain" />;
  if (block.meta.type === "audio") return <audio src={url} controls preload="metadata" className="nodrag nowheel w-full" />;
  return <img src={url} alt={block.meta.title} loading="lazy" className="max-h-48 w-full rounded object-contain" />;
}
function FilmCard({ data, selected }: NodeProps<CardNode>) {
  const m = data.block.meta;
  return <div className={`w-56 rounded-lg border bg-surface p-3 text-body shadow ${selected ? "border-primary" : m.status === "stale" ? "border-fusion" : "border-border-solid"}`}>
    <Handle type="target" position={Position.Left} className="!bg-primary" />
    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-muted"><span>{data.label} · v{m.version}</span><span>{data.state}{m.locked && " 🔒"}</span></div>
    <Thumbnail scope={data.scope} slug={data.slug} block={data.selected ?? data.block} />
    <div className="mt-2 text-xs font-medium text-heading">{m.title}</div>
    <div className="mt-1 text-[10px] text-muted">{m.id}{m.duration && ` · ${m.duration}s · ${m.size ?? ""}`}</div>
    {m.stale_from?.length > 0 && <div className="mt-2 text-[10px] text-fusion">↻ {m.stale_from.join(", ")}</div>}
    <Handle type="source" position={Position.Right} className="!bg-primary" />
  </div>;
}
const nodeTypes = { film: FilmCard };

export function FilmBoardView({ scope, initialSlug }: { scope: WorkspaceScope; initialSlug?: string }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<string[]>([]), [slug, setSlug] = useState(initialSlug ?? "");
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null), [error, setError] = useState("");
  const [view, setView] = useState<"canvas" | "assets" | "storyboard" | "timeline">("canvas"), [activeId, setActiveId] = useState("");
  const [nodes, setNodes] = useState<CardNode[]>([]), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [body, setBody] = useState("");
  const [shotEdit, setShotEdit] = useState({ action: "", size: "MS", duration: 5 }), [editVersion, setEditVersion] = useState(0);
  const [create, setCreate] = useState(false), [title, setTitle] = useState(""), [newSlug, setNewSlug] = useState("");
  const busyRef = useRef(false), dirtyLayout = useRef(false);
  const activeBoard = useRef(""), latestLoad = useRef(0);
  activeBoard.current = `${scope.base}/${slug}`;
  const load = useCallback(async () => {
    if (!slug) return;
    const request = ++latestLoad.current, key = `${scope.base}/${slug}`;
    const next = await fetchBoard(scope, slug);
    if (latestLoad.current === request && activeBoard.current === key) { setSnapshot(next); setError(""); }
  }, [scope.base, slug]);
  useEffect(() => { let stop = false; listProjects(scope).then(items => { if (stop) return; setProjects(items); setSlug(old => items.includes(old) ? old : items[0] ?? ""); }).catch(e => { if (!stop) setError(apiErrorMessage(e)); }); return () => { stop = true; }; }, [scope.base]);
  useEffect(() => {
    let stop = false; setSnapshot(null); setActiveId(""); setEditing(false); dirtyLayout.current = false;
    const poll = () => { if (!stop && !busyRef.current && document.visibilityState !== "hidden") load().catch(e => { if (!stop) setError(apiErrorMessage(e)); }); };
    poll(); const timer = window.setInterval(poll, 5000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [load]);
  const selectedMedia = useCallback((b: BoardBlock) => {
    const pkg = b.meta.type === "shot" && snapshot?.blocks.find(p => p.meta.type === "package" && p.meta.id === b.meta.video?.plan?.replace(/^package:/, "") && p.meta.shot_ids?.includes(b.meta.id));
    const id = b.meta.selected_clip ?? (pkg ? pkg.meta.selected_clip : undefined) ?? b.meta.selected_keyframe ?? (typeof b.meta.canon === "string" ? b.meta.canon : b.meta.canon?.[0]) ?? b.meta.selected;
    return snapshot?.blocks.find(child => child.meta.id === id);
  }, [snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    setNodes(old => {
      const positions = new Map(old.map(n => [n.id, n.position]));
      return snapshot.blocks.filter(b => b.meta.status !== "discarded").map((b, i) => ({ id: b.meta.id, type: "film" as const, position: dirtyLayout.current && positions.get(b.meta.id) || snapshot.layout.nodes?.[b.meta.id] || { x: (i % 4) * 300, y: Math.floor(i / 4) * 280 }, data: { block: b, scope, slug, selected: selectedMedia(b), label: t(`film.type.${b.meta.type}`, b.meta.type), state: t(`film.status.${b.meta.status}`, b.meta.status) } }));
    });
  }, [snapshot, selectedMedia, scope.base, slug, t]);
  const edges = useMemo(() => snapshot?.blocks.flatMap(b => {
    const refs = [...(b.meta.derived_from ?? []), ...(b.meta.refs ?? []).map(r => r.id), b.meta.parent, b.meta.scene].filter(Boolean).map(r => r.replace(/@v\d+$/, ""));
    return [...new Set(refs)].filter(id => id !== b.meta.id && nodes.some(n => n.id === id)).map(id => ({ id: `${id}→${b.meta.id}`, source: id, target: b.meta.id, animated: b.meta.status === "stale", style: { stroke: b.meta.status === "stale" ? "#e2829a" : "#64748b" } }));
  }) ?? [], [snapshot, nodes]);
  const active = snapshot?.blocks.find(b => b.meta.id === activeId), children = snapshot?.blocks.filter(b => b.meta.parent === activeId && b.meta.file) ?? [];
  const grid = (snapshot?.blocks ?? []).filter(b => view === "assets" ? assets.has(b.meta.type) : b.meta.type === "shot").sort((a, b) => (a.meta.scene ?? "").localeCompare(b.meta.scene ?? "") || (a.meta.order ?? 0) - (b.meta.order ?? 0));
  async function change(op: string, id?: string, args: Record<string, unknown> = {}) {
    if (busyRef.current) return false;
    setBusy(true); busyRef.current = true;
    try { await mutateBoard(scope, slug, op, id, args); await load(); setEditing(false); return true; }
    catch (e) { setError(apiErrorMessage(e)); return false; }
    finally { setBusy(false); busyRef.current = false; }
  }
  async function saveLayout() {
    if (!snapshot || !dirtyLayout.current) return;
    const layout = { ...snapshot.layout, nodes: Object.fromEntries(nodes.map(n => [n.id, n.position])) };
    if (await change("layout", undefined, { layout })) dirtyLayout.current = false;
  }
  function startEdit() {
    if (!active) return; setEditVersion(active.meta.version); setBody(active.body); setShotEdit({ action: active.meta.action ?? "", size: active.meta.size ?? "MS", duration: active.meta.duration ?? 5 }); setEditing(true);
  }
  async function newProject() {
    if (busyRef.current) return;
    setBusy(true); busyRef.current = true;
    try { await mutateBoard(scope, newSlug, "init", undefined, { fields: { title } }); setProjects(old => [...old, newSlug]); setSlug(newSlug); setCreate(false); setError(""); }
    catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); busyRef.current = false; }
  }
  return <div className="flex h-full min-h-0 min-w-0 flex-col text-xs">
    <div className="flex flex-wrap items-center gap-2 border-b border-border-solid bg-surface px-3 py-2">
      <select value={slug} onChange={e => setSlug(e.target.value)} aria-label={t("film.project")} className="max-w-40 rounded border border-border-solid bg-bg p-1.5"><option value="">{t("film.project")}</option>{projects.map(s => <option key={s}>{s}</option>)}</select>
      <button onClick={() => setCreate(v => !v)} className="text-primary">+ {t("film.new")}</button>
      <div className="flex gap-1" role="group" aria-label={t("film.views")}>{(["canvas", "assets", "storyboard", "timeline"] as const).map(v => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded px-2 py-1.5 ${view === v ? "bg-primary/15 text-primary" : "text-muted"}`}>{t(`film.view.${v}`)}</button>)}</div>
      <button onClick={() => change("reindex")} disabled={!slug || busy} title={t("film.refresh")} className="ms-auto p-1.5 text-muted"><RefreshCw size={14} /></button>
      {dirtyLayout.current && <button onClick={saveLayout} disabled={busy} className="text-primary">{t("film.save-layout")}</button>}
    </div>
    {create && <form onSubmit={e => { e.preventDefault(); newProject(); }} className="flex flex-wrap gap-2 border-b border-border-solid p-3"><input required value={title} onChange={e => setTitle(e.target.value)} placeholder={t("film.title")} className="min-w-0 flex-1 rounded border border-border-solid bg-surface p-2" /><input required pattern="[a-z0-9][a-z0-9-]{0,79}" value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder={t("film.slug")} className="min-w-0 flex-1 rounded border border-border-solid bg-surface p-2" /><button disabled={busy} className="text-primary">{t("film.create")}</button></form>}
    {error && <p role="alert" className="border-b border-border-solid p-3 text-fusion">{error}</p>}
    {snapshot && <div className="border-b border-border-solid px-3 py-2 text-muted">{snapshot.project.title} · {snapshot.project.stage} · {snapshot.project.duration}s · {snapshot.project.aspect} · ${snapshot.spent.toFixed(2)} / ${snapshot.project.budget}{snapshot.stale.length > 0 && <span className="ms-2 text-fusion">{t("film.stale", { count: snapshot.stale.length })}</span>}{snapshot.errors.map(e => <p key={e.path} className="text-fusion">{e.path}: {e.error}</p>)}</div>}
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {!snapshot ? <p className="p-4 text-muted">{t(projects.length ? "common.loading" : "film.empty")}</p> : view === "timeline" ? <FilmTimeline snapshot={snapshot} scope={scope} onNote={(shot, second, text) => change("new", undefined, { meta: { id: `NOTE-${Date.now()}`, type: "note", title: `${shot} · ${second.toFixed(1)}s`, parent: shot, time: second }, body: text })} /> : view === "storyboard" ? <FilmShotTable snapshot={snapshot} scope={scope} change={change} onOpen={id => { setActiveId(id); setEditing(false); }} /> : view === "canvas" ? <div className="min-h-0 flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={.15} maxZoom={2} onNodesChange={(changes: NodeChange<CardNode>[]) => { if (changes.some(c => c.type === "position" && c.dragging)) dirtyLayout.current = true; setNodes(old => applyNodeChanges(changes, old)); }} onNodeClick={(_, node) => { setActiveId(node.id); setEditing(false); }} onNodeDragStop={() => { dirtyLayout.current = true; }} proOptions={{ hideAttribution: true }}><Background /><Controls showInteractive={false} /></ReactFlow></div> : <div className="grid min-w-0 flex-1 content-start gap-3 overflow-auto p-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>{grid.map(b => <article key={b.meta.id} className={`rounded-lg border bg-surface p-3 text-start ${b.meta.status === "stale" ? "border-fusion" : "border-border-solid"}`}><Thumbnail scope={scope} slug={slug} block={selectedMedia(b) ?? b} /><button onClick={() => { setActiveId(b.meta.id); setEditing(false); }} className="mt-2 w-full text-start font-medium text-heading hover:text-primary">{b.meta.title}</button><p className="mt-1 text-muted">{b.meta.id} · {t(`film.status.${b.meta.status}`, b.meta.status)}{b.meta.duration && ` · ${b.meta.duration}s`}</p></article>)}</div>}
      {active && <div className="absolute inset-y-0 end-0 z-10 flex w-[min(90%,360px)] flex-col border-s border-border-solid bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-border-solid p-3"><span className="min-w-0 flex-1 truncate font-medium">{active.meta.title} · v{active.meta.version}</span><button onClick={() => { setActiveId(""); setEditing(false); }} aria-label={t("common.close")}><X size={16} /></button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          <Thumbnail scope={scope} slug={slug} block={selectedMedia(active) ?? active} />
          <p className="text-muted">{active.meta.id} · {t(`film.status.${active.meta.status}`, active.meta.status)}</p>
          {active.meta.edited_by_user?.length > 0 && <p className="text-primary">{t("film.user-edit")}: {active.meta.edited_by_user.join(", ")}</p>}
          {editing ? <><textarea value={body} onChange={e => setBody(e.target.value)} rows={10} aria-label={t("film.content")} className="w-full rounded border border-border-solid bg-bg p-2" />{active.meta.type === "shot" && <><label className="block">{t("film.action")}<textarea value={shotEdit.action} onChange={e => setShotEdit(s => ({ ...s, action: e.target.value }))} className="mt-1 w-full rounded border border-border-solid bg-bg p-2" /></label><div className="flex gap-2"><label>{t("film.size")}<select value={shotEdit.size} onChange={e => setShotEdit(s => ({ ...s, size: e.target.value }))} className="ms-2 bg-bg p-2">{["ELS", "LS", "FS", "MS", "MCU", "CU", "ECU", "OTS", "POV"].map(s => <option key={s}>{s}</option>)}</select></label><label>{t("film.duration")}<input type="number" min=".1" max="3600" step=".1" value={shotEdit.duration} onChange={e => setShotEdit(s => ({ ...s, duration: Number(e.target.value) }))} className="ms-2 w-16 bg-bg p-2" /></label></div></>}<p className="text-muted">{t("film.revise-hint")}</p><button disabled={busy} onClick={() => change(active.meta.locked || ["approved", "locked", "stale"].includes(active.meta.status) ? "revise" : "update", active.meta.id, { patch: active.meta.type === "shot" ? shotEdit : {}, options: { body, expectedVersion: editVersion } })} className="rounded bg-primary/15 px-3 py-2 text-primary">{t("film.save")}</button></> : <article><Markdown text={active.body || active.meta.action || ""} variant="article" /></article>}
          {!editing && <div className="flex flex-wrap gap-2"><button onClick={startEdit} className="inline-flex items-center gap-1 rounded border border-border-solid p-2"><Pencil size={13} />{t("film.edit")}</button><button disabled={busy || bad.has(active.meta.status) || active.meta.locked} onClick={() => change("approve", active.meta.id, { options: { expectedVersion: active.meta.version } })} className="inline-flex items-center gap-1 rounded border border-border-solid p-2"><Check size={13} />{t("film.approve")}</button><button disabled={busy || bad.has(active.meta.status) || active.meta.locked} onClick={() => change("lock", active.meta.id, { options: { expectedVersion: active.meta.version } })} className="inline-flex items-center gap-1 rounded border border-border-solid p-2"><Lock size={13} />{t("film.lock")}</button></div>}
          {children.length > 0 && <div><p className="mb-2 text-muted">{t("film.candidates")}</p>{children.map(child => <div key={child.meta.id} className="mb-2 space-y-2 rounded border border-border-solid p-2"><Thumbnail scope={scope} slug={slug} block={child} /><p>{child.meta.title} · {t(`film.status.${child.meta.status}`, child.meta.status)}</p>{["keyframe", "clip", "sheet"].includes(child.meta.type) && <button disabled={busy || bad.has(child.meta.status)} onClick={() => change("select", active.meta.id, { child: child.meta.id, options: { expectedVersion: active.meta.version } })} className="text-primary">{t("film.select")}</button>}</div>)}</div>}
        </div>
      </div>}
    </div>
  </div>;
}
