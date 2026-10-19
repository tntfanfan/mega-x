import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Markdown } from "../../../components/ui/Markdown";
import { apiErrorMessage } from "../../../lib/api";
import {
  ActionRefused, STATUS_LABEL, isImage, versionOf,
  type Action, type ArtifactDetail, type ChatRef, type Impacts, type SeriesApi, type Version,
} from "../api";
import { MediaGrid } from "./MediaGrid";
import { dragRef } from "./ProjectTree";

type Confirm = { action: Action; ref: string; impacts: Impacts; allowDraft: boolean };
type Refused = { action: Action; ref: string; message: string; problems: string[] };

const ACTION_TEXT: Record<Action, string> = { canonical: "定稿", uncanonical: "取消定稿", deprecate: "弃用" };

/**
 * 右栏：当前产出物。版本切换；文本用阅读器，图用候选卡片，视频直接播放。
 * 「定稿 vN」是确定性动作，直接调 /actions（有下游会先列出影响让用户确认）；
 * 「再出 3 张」作为一条聊天消息发出。
 */
export function ArtifactPanel({ api, projectId, logical, refreshKey, busy, onSend, onRef, onChanged }: {
  api: SeriesApi;
  projectId: string;
  logical: string;
  refreshKey: number;
  busy: boolean;
  onSend: (text: string, refs: ChatRef[]) => boolean;
  onRef: (ref: ChatRef) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [refused, setRefused] = useState<Refused | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => { setPicked(""); setConfirm(null); setRefused(null); setNotice(""); }, [projectId, logical]);
  useEffect(() => {
    if (!projectId || !logical) { setDetail(null); return; }
    let alive = true;
    api.artifact(projectId, logical)
      .then(d => { if (alive) { setDetail(d); setError(""); } })
      .catch(e => { if (alive) setError(apiErrorMessage(e, "读取产出物失败")); });
    return () => { alive = false; };
  }, [api, projectId, logical, refreshKey]);

  if (!logical) return <p className="p-4 text-xs text-muted">点左栏的产出物在这里查看；拖到聊天就是引用。</p>;
  if (error) return <p className="p-4 text-xs text-fusion">{error}</p>;
  if (!detail || detail.logical !== logical) return <p className="p-4 text-xs text-muted">加载中…</p>;

  const versions = [...detail.versions].reverse();
  const current: Version | undefined = versions.find(v => v.ref === picked) || versions.find(v => v.status === "canonical") || versions[0];
  if (!current) return <p className="p-4 text-xs text-muted">没有版本。</p>;
  const ref = (v: Version): ChatRef => ({ ref: v.ref, label: `${detail.label} ${versionOf(v.ref)}`, project_id: projectId });
  const images = current.media.filter(isImage);

  const run = async (action: Action, target: string, confirmed = false, allowDraft = false) => {
    setWorking(true); setNotice(""); setRefused(null);
    try {
      const result = await api.action(projectId, { action, ref: target, confirm: confirmed || undefined, allow_draft: allowDraft || undefined });
      if (!result.ok && "needs_confirm" in result) {
        setConfirm({ action, ref: target, impacts: result.impacts, allowDraft });
        return;
      }
      setConfirm(null);
      const marked = result.ok ? result.marked || 0 : 0;
      setNotice(result.ok && result.unchanged ? `${versionOf(target)} 已经是${STATUS_LABEL[result.status] || result.status}`
        : `已${ACTION_TEXT[action]} ${versionOf(target)}${marked ? `，${marked} 项下游标为过期` : ""}`);
      onChanged();
    } catch (e) {
      setConfirm(null);
      if (e instanceof ActionRefused) setRefused({ action, ref: target, message: e.message, problems: e.problems });
      else setNotice(apiErrorMessage(e, `${ACTION_TEXT[action]}失败`));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 draggable onDragStart={e => dragRef(e, ref(current))} title="拖到聊天 = 引用" className="cursor-grab font-medium text-heading">{detail.label}</h2>
        <button type="button" onClick={() => onRef(ref(current))} className="shrink-0 text-xs text-primary hover:underline">引用</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {versions.map(v => (
          <button key={v.ref} type="button" onClick={() => setPicked(v.ref)} draggable onDragStart={e => dragRef(e, ref(v))}
            title={`${v.ref}\n${STATUS_LABEL[v.status] || v.status}${v.created_at ? ` · ${v.created_at}` : ""}`}
            className={`rounded border px-2 py-0.5 text-xs ${v.ref === current.ref ? "border-primary text-primary" : "border-border-solid text-body hover:border-primary"}`}>
            {versionOf(v.ref)}{v.status === "canonical" ? " ✔" : v.status === "stale" ? " ⚠" : v.status === "deprecated" ? " ✕" : ""}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {current.status !== "canonical" && (
          <button type="button" disabled={working} onClick={() => run("canonical", current.ref)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">定稿 {versionOf(current.ref)}</button>
        )}
        {current.status === "canonical" && (
          <button type="button" disabled={working} onClick={() => run("uncanonical", current.ref)}
            className="rounded-md border border-border-solid px-3 py-1 text-xs text-body hover:border-primary disabled:opacity-40">取消定稿</button>
        )}
        {current.status !== "deprecated" && (
          <button type="button" disabled={working} onClick={() => run("deprecate", current.ref)}
            className="rounded-md border border-border-solid px-3 py-1 text-xs text-body hover:border-fusion hover:text-fusion disabled:opacity-40">弃用</button>
        )}
        {images.length > 0 && (
          <button type="button" disabled={busy} onClick={() => onSend(`${detail.label}再出 3 张候选${picked ? `，参考 ${versionOf(current.ref)}` : ""}。`, [ref(current)])}
            className="rounded-md border border-border-solid px-3 py-1 text-xs text-body hover:border-primary disabled:opacity-40">再出 3 张</button>
        )}
        {working && <LoaderCircle size={14} aria-hidden className="animate-spin text-muted" />}
      </div>
      {notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}

      {confirm && (
        <div role="alertdialog" aria-label="确认影响" className="mt-3 rounded-lg border border-spark-flare/50 bg-spark-flare/5 p-3 text-xs">
          <p className="font-medium text-heading">{ACTION_TEXT[confirm.action]} {versionOf(confirm.ref)} 会让 {confirm.impacts.items.length} 项下游过期：</p>
          <ul className="mt-1 space-y-0.5 text-body">
            {confirm.impacts.summary.map(s => <li key={s.kind}>· {s.label || s.kind} ×{s.count}</li>)}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={working} onClick={() => run(confirm.action, confirm.ref, true, confirm.allowDraft)}
              className="rounded-md bg-primary px-3 py-1 font-medium text-bg disabled:opacity-40">确认{ACTION_TEXT[confirm.action]}</button>
            <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-border-solid px-3 py-1 text-body">算了</button>
          </div>
        </div>
      )}
      {refused && (
        <div role="alert" className="mt-3 rounded-lg border border-fusion/40 bg-fusion/5 p-3 text-xs">
          <p className="font-medium text-fusion">{refused.message}</p>
          {refused.problems.length > 0 && <ul className="mt-1 list-disc space-y-0.5 ps-4 text-body">{refused.problems.map(p => <li key={p}>{p}</li>)}</ul>}
          <div className="mt-2 flex gap-2">
            {refused.action === "canonical" && (
              <button type="button" disabled={working} onClick={() => run("canonical", refused.ref, false, true)}
                className="rounded-md border border-border-solid px-3 py-1 text-body hover:border-primary">依赖还是草稿，也照样定稿</button>
            )}
            <button type="button" disabled={busy} onClick={() => { onSend(`${detail.label} ${versionOf(refused.ref)} 还不能定稿：${refused.problems.join("；") || refused.message}。帮我补上。`, [ref(current)]); setRefused(null); }}
              className="rounded-md border border-border-solid px-3 py-1 text-body hover:border-primary">让主创补上</button>
          </div>
        </div>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        <MediaGrid media={current.media} src={api.mediaSrc} large
          onPick={images.length > 1 ? (_item, index) => onSend(`${detail.label} ${versionOf(current.ref)} 选第 ${index + 1} 张。`, [ref(current)]) : undefined} />
        {current.text && <div className="mt-3 rounded-md border border-border-solid bg-surface/60 p-3"><Markdown text={stripFrontmatter(current.text)} variant="article" /></div>}
        <dl className="mt-3 space-y-1 text-xs text-muted">
          {current.depends_on.length > 0 && <div><dt className="inline">依赖：</dt><dd className="inline">{current.depends_on.map(versionLabel).join("、")}</dd></div>}
          {current.downstream.length > 0 && <div><dt className="inline">下游：</dt><dd className="inline">{summarize(current.downstream)}</dd></div>}
          {current.revision_of && <div><dt className="inline">改自：</dt><dd className="inline">{versionLabel(current.revision_of)}</dd></div>}
        </dl>
      </div>
    </div>
  );
}

/** 正文前的 YAML 头（kind / version / status…）是给系统看的，阅读器里不显示。 */
function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function versionLabel(ref: string): string {
  const slash = ref.lastIndexOf("/");
  return slash >= 0 ? ref.slice(slash + 1) : ref;
}

function summarize(refs: string[]): string {
  const counts: Record<string, number> = {};
  for (const r of refs) {
    const dir = r.split("/").slice(0, -1).join("/") || r;
    counts[dir] = (counts[dir] || 0) + 1;
  }
  return Object.entries(counts).map(([dir, n]) => `${dir} ×${n}`).join("、");
}
