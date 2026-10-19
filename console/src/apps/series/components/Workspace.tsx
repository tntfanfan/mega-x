import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquarePlus, Sparkles, Video } from "lucide-react";
import type { ChatRef, ProjectStatus, SeriesApi, StatusItem } from "../api";
import { dragRef } from "../drag";
import { STAGES, hasNewer, itemRef, itemState, sectionOf, shortLabel, shortVersion, stageItems, type StageId } from "../stages";
import { ArtifactView } from "./ArtifactView";
import { KindIcon, StatusDot, StatusPill } from "./bits";

type Props = {
  api: SeriesApi;
  status: ProjectStatus | null;
  stage: StageId;
  onStage: (stage: StageId) => void;
  selected: string;
  focusRef?: string;
  onSelect: (logical: string) => void;
  refreshKey: number;
  busy: boolean;
  connected: boolean;
  onSend: (text: string, refs: ChatRef[]) => boolean;
  onRef: (ref: ChatRef) => void;
  onQuote: (ref: ChatRef, text: string) => void;
  onOpen: (ref: string) => void;
  onChanged: () => void;
  onDirty: (dirty: boolean) => void;
  onSuggest: (text: string) => void;
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function sections(items: StatusItem[]): { name: string; items: StatusItem[] }[] {
  const out: { name: string; items: StatusItem[] }[] = [];
  for (const item of items) {
    const name = sectionOf(item);
    const last = out[out.length - 1];
    if (last && last.name === name) last.items.push(item);
    else out.push({ name, items: [item] });
  }
  return out;
}

/**
 * 右侧工作区：按环节分栏（设定 / 剧本 / 资产 / 分镜 / 视频 / 成片 / 审查）。
 * 没选中时是卡片墙，一眼看清每样东西的状态；选中后左边是本栏清单，右边是这一项的版本和内容。
 * 卡片、清单、版本、图片都能直接拖进对话。
 */
export function Workspace(props: Props) {
  const { status, stage, onStage, selected, onSelect, onSuggest } = props;
  const [box, width] = useWidth<HTMLDivElement>();
  const items = useMemo(() => stageItems(status, stage), [status, stage]);
  const current = STAGES.find(s => s.id === stage) || STAGES[0];
  const wide = width >= 760;

  const counts = useMemo(() => Object.fromEntries(STAGES.map(s => {
    const list = stageItems(status, s.id);
    return [s.id, { total: list.length, live: list.filter(i => itemState(i) === "canonical").length, stale: list.some(i => itemState(i) === "stale"), newer: list.some(hasNewer) }];
  })), [status]);

  const ref = (item: StatusItem): ChatRef => ({ ref: itemRef(item), label: item.label, project_id: status?.project_id });
  const at = items.findIndex(i => i.logical === selected);
  const open = selected && at >= 0 ? items[at] : null;

  return (
    <section ref={box} aria-label="产出物" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface/30">
      <nav aria-label="环节" className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border-solid px-2 [scrollbar-width:none]">
        {STAGES.map(s => {
          const c = counts[s.id];
          const on = s.id === stage;
          return (
            <button key={s.id} type="button" onClick={() => onStage(s.id)} aria-current={on ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition-colors ${on ? "text-heading" : c.total ? "text-body hover:text-heading" : "text-dim hover:text-muted"}`}>
              {s.label}
              {c.total > 0 && <span className={`tabular-nums text-[11px] ${on ? "text-muted" : "text-dim"}`} title={`${c.live} 项生效 / 共 ${c.total} 项`}>{c.live}/{c.total}</span>}
              {c.stale && <StatusDot tone="stale" className="absolute end-1 top-2" />}
              {!c.stale && c.newer && <StatusDot tone="newer" className="absolute end-1 top-2" />}
              {on && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {!status ? (
        <Empty text="还没选项目。" hint="在左边对话里说说你想做一部什么样的剧，主创会帮你建好项目。" />
      ) : !items.length ? (
        <Empty text={current.empty} hint="环节不分先后，想先做哪样都行。"
          action={{ label: current.suggest, run: () => onSuggest(current.suggest) }} />
      ) : open ? (
        <div className="flex min-h-0 flex-1">
          {wide && (
            <aside aria-label={`${current.label}清单`} className="flex w-56 shrink-0 flex-col border-e border-border-solid">
              <button type="button" onClick={() => onSelect("")}
                className="flex shrink-0 items-center gap-1 border-b border-border-solid px-3 py-2 text-xs text-muted transition-colors hover:text-primary">
                <ArrowLeft size={13} aria-hidden />全部{current.label}
              </button>
              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                {sections(items).map(sec => (
                  <li key={sec.name || "_"}>
                    {sec.name && <div className="px-3 pb-0.5 pt-2 text-[10px] uppercase tracking-wider text-dim">{sec.name}</div>}
                    <ul>{sec.items.map(item => <Row key={item.logical} item={item} active={item.logical === selected} onClick={() => onSelect(item.logical)} chatRef={ref(item)} />)}</ul>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!wide && (
              <div className="flex shrink-0 items-center gap-1 border-b border-border-solid px-2 py-1 text-xs text-muted">
                <button type="button" onClick={() => onSelect("")} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:text-primary"><ArrowLeft size={13} aria-hidden />全部{current.label}</button>
                <span className="flex-1" />
                <span className="tabular-nums text-dim">{at + 1} / {items.length}</span>
                <button type="button" disabled={at <= 0} onClick={() => onSelect(items[at - 1].logical)} aria-label="上一项" className="rounded p-1 hover:text-primary disabled:opacity-30"><ChevronLeft size={15} aria-hidden /></button>
                <button type="button" disabled={at >= items.length - 1} onClick={() => onSelect(items[at + 1].logical)} aria-label="下一项" className="rounded p-1 hover:text-primary disabled:opacity-30"><ChevronRight size={15} aria-hidden /></button>
              </div>
            )}
            <ArtifactView api={props.api} projectId={status.project_id} logical={open.logical} focusRef={props.focusRef}
              refreshKey={props.refreshKey} status={status} busy={props.busy} connected={props.connected}
              onSend={props.onSend} onRef={props.onRef} onQuote={props.onQuote} onOpen={props.onOpen}
              onChanged={props.onChanged} onDirty={props.onDirty} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {sections(items).map(sec => (
            <div key={sec.name || "_"} className="mb-5">
              {sec.name && <h3 className="mb-2 text-xs font-medium text-muted">{sec.name}</h3>}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                {sec.items.map(item => <Card key={item.logical} item={item} src={props.api.mediaSrc} chatRef={ref(item)} onClick={() => onSelect(item.logical)} onRef={props.onRef} />)}
              </ul>
            </div>
          ))}
          <p className="mt-2 text-center text-[11px] text-dim">点开看版本和内容 · 拖到对话里继续问</p>
        </div>
      )}
    </section>
  );
}

function Empty({ text, hint, action }: { text: string; hint: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm text-heading">{text}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {action && (
        <button type="button" onClick={action.run}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10">
          <Sparkles size={12} aria-hidden />{action.label}
        </button>
      )}
    </div>
  );
}

function Pill({ item }: { item: StatusItem }) {
  const state = itemState(item);
  if (hasNewer(item)) return <StatusPill tone="newer" title={`生效的是 ${shortVersion(item.canonical!)}，最新是 ${shortVersion(item.latest)}`}>有新稿</StatusPill>;
  return <StatusPill tone={state} />;
}

function Card({ item, src, chatRef, onClick, onRef }: { item: StatusItem; src: (url: string) => string; chatRef: ChatRef; onClick: () => void; onRef: (ref: ChatRef) => void }) {
  const state = itemState(item);
  return (
    <li className="group relative">
      <button type="button" onClick={onClick} draggable onDragStart={e => dragRef(e, chatRef)} title={`${item.label}\n点开查看 · 拖到对话 = 引用`}
        className={`flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg ${state === "stale" ? "border-spark-flare/40" : "border-border-solid"} ${state === "deprecated" ? "opacity-50" : ""}`}>
        <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-surface-2">
          {item.thumb
            ? <img src={src(item.thumb)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
            : item.media_kind === "video"
              ? <Video size={28} aria-hidden className="text-dim" />
              : <KindIcon kind={item.kind} size={28} className="text-dim" />}
        </div>
        <div className="flex w-full items-center gap-2 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-heading">{shortLabel(item)}</span>
          <Pill item={item} />
        </div>
        <div className="px-2.5 pb-2 text-[11px] tabular-nums text-dim">
          {item.canonical ? `生效 ${shortVersion(item.canonical)}` : `最新 ${shortVersion(item.latest)}`}
          {item.canonical && item.latest !== item.canonical ? ` · 最新 ${shortVersion(item.latest)}` : ""}
        </div>
      </button>
      <button type="button" onClick={() => onRef(chatRef)} title="引用到对话" aria-label={`引用 ${item.label} 到对话`}
        className="absolute end-1.5 top-1.5 rounded-md bg-bg/80 p-1 text-muted opacity-0 backdrop-blur transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100">
        <MessageSquarePlus size={14} aria-hidden />
      </button>
    </li>
  );
}

function Row({ item, active, onClick, chatRef }: { item: StatusItem; active: boolean; onClick: () => void; chatRef: ChatRef }) {
  const state = itemState(item);
  return (
    <li>
      <button type="button" onClick={onClick} draggable onDragStart={e => dragRef(e, chatRef)} title={`${item.label} · 拖到对话 = 引用`}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${active ? "bg-primary/10 text-heading" : "text-body hover:bg-surface-2"} ${state === "deprecated" ? "opacity-50" : ""}`}>
        <StatusDot tone={hasNewer(item) ? "newer" : state} />
        <span className="min-w-0 flex-1 truncate">{shortLabel(item)}</span>
        <span className="text-[10px] tabular-nums text-dim">{shortVersion(itemRef(item))}</span>
      </button>
    </li>
  );
}
