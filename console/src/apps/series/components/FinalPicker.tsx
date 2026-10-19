import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDashed, LoaderCircle, Undo2 } from "lucide-react";
import { apiErrorMessage } from "../../../lib/api";
import {
  ActionRefused, isImage, type Action, type ArtifactDetail, type Impacts, type SeriesApi, type StatusItem, type Version,
} from "../api";
import { authorLabel, hasNewer, itemState, shortVersion, timeLabel } from "../stages";
import { Popover, StatusPill, toneOf } from "./bits";

/** Kinds that are never final (series_mcp.kinds.NO_CANONICAL): references and reviews. */
export const NO_FINAL = new Set(["reference", "review"]);

export function canFinal(item: StatusItem): boolean {
  return !NO_FINAL.has(item.kind);
}

export type Notice = { text: string; action?: { label: string; run: () => void } };

type Pending =
  | { kind: "confirm"; action: Action; ref: string; impacts: Impacts; allowDraft: boolean }
  | { kind: "refused"; ref: string; message: string; problems: string[] };

/**
 * 选这一项最终用哪一版：触发器显示现在的定稿版本（没有就是「未定稿」），
 * 点开列出所有版本，点一版就定稿；会让下游过期、或者还不能定稿时，就在面板里说清楚再确认。
 */
export function FinalPicker({ api, projectId, item, onChanged, onNotice, onUpdateDownstream, align = "end", size = "md" }: {
  api: SeriesApi;
  projectId: string;
  item: StatusItem;
  onChanged: () => void;
  onNotice: (notice: Notice) => void;
  /** After downstream went stale: ask the agent to bring it up to date. */
  onUpdateDownstream?: (label: string, ref: string) => void;
  align?: "start" | "end";
  size?: "sm" | "md";
}) {
  if (!canFinal(item)) return null;
  const state = itemState(item);
  const final = item.canonical || (state === "stale" ? item.stale[item.stale.length - 1] : "");
  const newer = hasNewer(item);
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs";
  const trigger = final ? (
    <span className={`inline-flex items-center gap-1 rounded-md border tabular-nums ${pad} ${state === "stale"
      ? "border-spark-flare/40 bg-spark-flare/10 text-spark-flare"
      : "border-spark-mint/40 bg-spark-mint/10 text-spark-mint"}`}>
      {state === "stale" ? <AlertTriangle size={11} aria-hidden /> : <Check size={11} aria-hidden />}
      {shortVersion(final)}
      {newer && <span className="ms-0.5 h-1.5 w-1.5 rounded-full bg-spark-blue" title="有更新的稿子" />}
      <ChevronDown size={11} aria-hidden className="opacity-60" />
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 rounded-md border border-dashed border-border-solid text-muted ${pad}`}>
      <CircleDashed size={11} aria-hidden />未定稿
      <ChevronDown size={11} aria-hidden className="opacity-60" />
    </span>
  );
  return (
    <Popover label={`${item.label}：选最终使用的版本`} title={final ? `最终使用 ${shortVersion(final)}，点这里换一版` : "还没选最终使用哪一版，点这里选"}
      align={align} className="!rounded-md !p-0 hover:!bg-transparent" trigger={trigger}>
      {close => (
        <FinalMenu api={api} projectId={projectId} item={item} close={close} onChanged={onChanged} onNotice={onNotice}
          onUpdateDownstream={onUpdateDownstream} />
      )}
    </Popover>
  );
}

function FinalMenu({ api, projectId, item, close, onChanged, onNotice, onUpdateDownstream }: {
  api: SeriesApi;
  projectId: string;
  item: StatusItem;
  close: () => void;
  onChanged: () => void;
  onNotice: (notice: Notice) => void;
  onUpdateDownstream?: (label: string, ref: string) => void;
}) {
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    let alive = true;
    api.artifact(projectId, item.logical)
      .then(d => { if (alive) setDetail(d); })
      .catch(e => { if (alive) setError(apiErrorMessage(e, "读取版本失败")); });
    return () => { alive = false; };
  }, [api, projectId, item.logical]);

  const run = async (action: Action, ref: string, confirm = false, allowDraft = false) => {
    setWorking(ref); setError("");
    try {
      const result = await api.action(projectId, { action, ref, confirm: confirm || undefined, allow_draft: allowDraft || undefined });
      if (!result.ok && "needs_confirm" in result) {
        setPending({ kind: "confirm", action, ref, impacts: result.impacts, allowDraft });
        return;
      }
      const marked = result.ok ? result.marked || 0 : 0;
      const v = shortVersion(ref);
      close();
      onChanged();
      onNotice({
        text: result.ok && result.unchanged ? `${item.label} 已经是 ${v}`
          : action === "canonical" ? `${item.label} 最终使用 ${v}${marked ? `，${marked} 项下游标成了过期` : ""}`
          : `${item.label} 取消了定稿${marked ? `，${marked} 项下游标成了过期` : ""}`,
        action: marked && onUpdateDownstream ? { label: "让主创更新下游", run: () => onUpdateDownstream(item.label, ref) } : undefined,
      });
    } catch (e) {
      if (e instanceof ActionRefused) setPending({ kind: "refused", ref, message: e.message, problems: e.problems });
      else setError(apiErrorMessage(e, "操作失败"));
    } finally {
      setWorking("");
    }
  };

  const versions = detail ? [...detail.versions].reverse() : [];
  const live = versions.find(v => v.status === "canonical");

  if (pending?.kind === "confirm") {
    const n = pending.impacts.items.length;
    return (
      <div className="space-y-2 p-3 text-xs" role="alertdialog" aria-label="确认影响">
        <p className="font-medium text-heading">
          {pending.action === "canonical" ? `改用 ${shortVersion(pending.ref)}` : `取消 ${shortVersion(pending.ref)} 的定稿`}，{n} 项下游会标成过期：
        </p>
        <ul className="space-y-0.5 text-body">
          {pending.impacts.summary.map(s => <li key={s.kind}>· {s.label || s.kind} ×{s.count}</li>)}
        </ul>
        <p className="text-muted">不会删除它们，只是提醒要按新的版本更新。</p>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={Boolean(working)} onClick={() => void run(pending.action, pending.ref, true, pending.allowDraft)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 font-medium text-bg disabled:opacity-40">
            {working && <LoaderCircle size={12} aria-hidden className="animate-spin" />}确认
          </button>
          <button type="button" onClick={() => setPending(null)} className="rounded-md border border-border-solid px-3 py-1 text-body">返回</button>
        </div>
      </div>
    );
  }
  if (pending?.kind === "refused") {
    return (
      <div className="space-y-2 p-3 text-xs" role="alert">
        <p className="font-medium text-fusion">{pending.message}</p>
        {pending.problems.length > 0 && <ul className="list-disc space-y-0.5 ps-4 text-body">{pending.problems.map(p => <li key={p}>{p}</li>)}</ul>}
        <div className="flex flex-wrap gap-2 pt-1">
          {pending.problems.some(p => p.startsWith("依赖")) && (
            <button type="button" disabled={Boolean(working)} onClick={() => void run("canonical", pending.ref, false, true)}
              className="rounded-md border border-border-solid px-2.5 py-1 text-body hover:border-primary disabled:opacity-40">依赖还是草稿，也照样定稿</button>
          )}
          <button type="button" onClick={() => setPending(null)} className="rounded-md border border-border-solid px-2.5 py-1 text-body">返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(60vh,26rem)] flex-col">
      <div className="shrink-0 border-b border-border-solid px-3 py-2">
        <p className="truncate text-xs font-medium text-heading">{item.label}</p>
        <p className="text-[11px] text-muted">选最终使用的一版，下游都以它为准</p>
      </div>
      <div role="listbox" aria-label="版本" className="min-h-0 flex-1 overflow-y-auto py-1">
        {!detail && !error && <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted"><LoaderCircle size={13} aria-hidden className="animate-spin" />读取版本…</p>}
        {versions.map(v => <VersionOption key={v.ref} version={v} src={api.mediaSrc} working={working === v.ref} disabled={Boolean(working)}
          onPick={() => (v.status === "canonical" ? close() : void run("canonical", v.ref))} />)}
      </div>
      {error && <p role="alert" className="shrink-0 border-t border-border-solid px-3 py-1.5 text-[11px] text-fusion">{error}</p>}
      {live && (
        <button type="button" disabled={Boolean(working)} onClick={() => void run("uncanonical", live.ref)}
          className="flex shrink-0 items-center gap-1.5 border-t border-border-solid px-3 py-2 text-xs text-muted transition-colors hover:bg-surface-3 hover:text-heading disabled:opacity-40">
          <Undo2 size={12} aria-hidden />取消定稿（{shortVersion(live.ref)} 退回草稿）
        </button>
      )}
    </div>
  );
}

function VersionOption({ version: v, src, working, disabled, onPick }: {
  version: Version;
  src: (url: string) => string;
  working: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const on = v.status === "canonical";
  const dead = v.status === "deprecated";
  const thumb = v.media.find(isImage);
  const meta = [authorLabel(v.created_by), timeLabel(v.created_at)].filter(Boolean).join(" · ");
  return (
    <button type="button" role="option" aria-selected={on} disabled={disabled || dead} onClick={onPick}
      title={dead ? "这一版弃用了" : on ? "正在使用这一版" : `最终使用 ${shortVersion(v.ref)}`}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${on ? "bg-spark-mint/5" : "hover:bg-surface-3"} ${dead ? "opacity-45" : ""}`}>
      <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-spark-mint bg-spark-mint text-bg" : "border-border-solid"}`}>
        {working ? <LoaderCircle size={10} className="animate-spin text-muted" /> : on && <Check size={10} strokeWidth={3} />}
      </span>
      {thumb && <img src={src(thumb.url)} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" />}
      <span className="min-w-0 flex-1">
        <span className={`block text-sm tabular-nums text-heading ${dead ? "line-through" : ""}`}>{shortVersion(v.ref)}</span>
        {meta && <span className="block truncate text-[11px] text-dim">{meta}</span>}
      </span>
      <StatusPill tone={toneOf(v.status)} />
    </button>
  );
}
