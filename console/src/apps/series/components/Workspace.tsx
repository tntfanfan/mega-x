import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, FolderTree, LayoutGrid, MessageSquarePlus, Sparkles, Video, X } from "lucide-react";
import type { ChatRef, ProjectStatus, SeriesApi, StatusItem } from "../api";
import { dragRef } from "../drag";
import { STAGES, hasNewer, itemRef, itemState, sectionOf, shortLabel, shortVersion, stageItems, type TabId } from "../stages";
import { ArtifactView } from "./ArtifactView";
import { KindIcon, StatusDot, StatusPill } from "./bits";
import { FilesView } from "./FilesView";
import { FinalPicker, canFinal, type Notice } from "./FinalPicker";
import { Overview } from "./Overview";

/** 结构化 = 按环节看产出物；文件 = 项目目录在磁盘上的原样。 */
export type SeriesView = "structured" | "files";

type Props = {
  view: SeriesView;
  onView: (view: SeriesView) => void;
  /** the file picked in the files view (project-relative) */
  filePath: string;
  onFilePath: (path: string) => void;
  /** a ref from the files view, to open in the structured view */
  onStructured: (ref: string) => void;
  api: SeriesApi;
  status: ProjectStatus | null;
  stage: TabId;
  onStage: (stage: TabId) => void;
  /** open one item in its stage (from the overview) */
  onShow: (item: StatusItem) => void;
  /** open a project file in the files view */
  onOpenFile: (path: string) => void;
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
 * 右侧工作区，两种看法，右上角切换：
 * - 结构化：先是「总览」（见 Overview），再按环节分栏（设定 / 剧本 / 资产 / 分镜 / 视频 / 成片 / 审查）。没选中时是卡片墙，
 *   一眼看清每样东西的状态；选中后左边是本栏清单，右边是这一项的版本和内容。
 * - 文件：项目目录的原样（见 FilesView），看底层到底有什么。
 * 卡片、清单、版本、图片、文件都能直接拖进对话。
 */
export function Workspace(props: Props) {
  const { status, stage, onStage, selected, onSelect, onSuggest, view, filePath } = props;
  const [box, width] = useWidth<HTMLDivElement>();
  const [reveal, setReveal] = useState<{ path: string; tick: number } | null>(null);
  const [notice, setNotice] = useState<(Notice & { tick: number }) | null>(null);
  const items = useMemo(() => (stage === "overview" ? [] : stageItems(status, stage)), [status, stage]);
  const current = STAGES.find(s => s.id === stage) || STAGES[0];
  const onNotice = useCallback((n: Notice) => setNotice(prev => ({ ...n, tick: (prev?.tick || 0) + 1 })), []);
  // A notice stays a few seconds; one with something to do stays longer.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.action ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const ask = (text: string, chatRef?: ChatRef) => {
    if (props.onSend(text, chatRef ? [chatRef] : [])) return;
    // Busy or offline: leave it in the box instead of losing it.
    if (chatRef) props.onRef(chatRef);
    onSuggest(text);
  };
  const updateDownstream = (label: string, ref: string) =>
    ask(`「${label}」改用了 ${shortVersion(ref)}，把因此过期的下游按它更新一下。`, { ref, label, project_id: status?.project_id });
  const wide = width >= 760;

  const counts = useMemo(() => Object.fromEntries(STAGES.map(s => {
    const list = stageItems(status, s.id);
    return [s.id, { total: list.length, live: list.filter(i => itemState(i) === "canonical").length, stale: list.some(i => itemState(i) === "stale"), newer: list.some(hasNewer) }];
  })), [status]);

  const ref = (item: StatusItem): ChatRef => ({ ref: itemRef(item), label: item.label, project_id: status?.project_id });
  const at = items.findIndex(i => i.logical === selected);
  const open = selected && at >= 0 ? items[at] : null;

  return (
    <section ref={box} aria-label="产出物" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface/30">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-solid pe-2">
        {view === "files" ? (
          <Crumbs root={status?.project_id || ""} path={filePath} onRoot={() => props.onFilePath("")}
            onDir={dir => setReveal(r => ({ path: dir, tick: (r?.tick || 0) + 1 }))} />
        ) : (
          <nav aria-label="环节" className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-2 [scrollbar-width:none]">
            <button type="button" onClick={() => onStage("overview")} aria-current={stage === "overview" ? "page" : undefined}
              title="总览：进度、定稿、偏好、最近的决定"
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition-colors ${stage === "overview" ? "text-heading" : "text-body hover:text-heading"}`}>
              总览
              {stage === "overview" && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
            <span aria-hidden className="my-2.5 w-px shrink-0 bg-border-solid" />
            {STAGES.map(s => {
              const c = counts[s.id];
              const on = s.id === stage;
              return (
                <button key={s.id} type="button" onClick={() => onStage(s.id)} aria-current={on ? "page" : undefined}
                  className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition-colors ${on ? "text-heading" : c.total ? "text-body hover:text-heading" : "text-dim hover:text-muted"}`}>
                  {s.label}
                  {c.total > 0 && <span className={`tabular-nums text-[11px] ${on ? "text-muted" : "text-dim"}`} title={`${c.live} 项定稿 / 共 ${c.total} 项`}>{c.live}/{c.total}</span>}
                  {c.stale && <StatusDot tone="stale" className="absolute end-1 top-2" />}
                  {!c.stale && c.newer && <StatusDot tone="newer" className="absolute end-1 top-2" />}
                  {on && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </nav>
        )}
        <ViewSwitch view={view} onView={props.onView} compact={width > 0 && width < 520} />
      </div>

      {!status ? (
        <Empty text="还没选项目。" hint="在左边对话里说说你想做一部什么样的剧，主创会帮你建好项目。" />
      ) : view === "files" ? (
        <FilesView api={props.api} status={status} refreshKey={props.refreshKey} path={filePath} onPath={props.onFilePath}
          reveal={reveal} wide={wide} onRef={props.onRef} onStructured={props.onStructured} />
      ) : stage === "overview" ? (
        <Overview api={props.api} status={status} refreshKey={props.refreshKey} width={width} onStage={onStage} onShow={props.onShow}
          onOpen={props.onOpen} onOpenFile={props.onOpenFile} onSuggest={onSuggest} onAsk={ask} onRef={props.onRef}
          onChanged={props.onChanged} onNotice={onNotice} onUpdateDownstream={updateDownstream} />
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
                {sec.items.map(item => (
                  <Card key={item.logical} item={item} src={props.api.mediaSrc} chatRef={ref(item)} onClick={() => onSelect(item.logical)} onRef={props.onRef}
                    picker={<FinalPicker api={props.api} projectId={status.project_id} item={item} size="sm" onChanged={props.onChanged}
                      onNotice={onNotice} onUpdateDownstream={updateDownstream} />} />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-2 text-center text-[11px] text-dim">点开看版本和内容 · 点版本号选最终使用哪一版 · 拖到对话里继续问</p>
        </div>
      )}
      {notice && (
        <div key={notice.tick} role="status"
          className="absolute bottom-4 start-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-spark-mint/40 bg-surface-2 px-3 py-2 text-xs text-body shadow-xl animate-in fade-in slide-in-from-bottom-2 rtl:translate-x-1/2">
          <CheckCircle2 size={14} aria-hidden className="shrink-0 text-spark-mint" />
          <span className="min-w-0">{notice.text}</span>
          {notice.action && (
            <button type="button" onClick={() => { notice.action!.run(); setNotice(null); }}
              className="shrink-0 font-medium text-primary hover:underline">{notice.action.label}</button>
          )}
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭" className="shrink-0 text-muted hover:text-heading"><X size={12} aria-hidden /></button>
        </div>
      )}
    </section>
  );
}

const VIEWS: { id: SeriesView; label: string; title: string; Icon: typeof LayoutGrid }[] = [
  { id: "structured", label: "结构化", title: "结构化：按环节看产出物、版本和状态", Icon: LayoutGrid },
  { id: "files", label: "文件", title: "文件系统：看项目目录里实际有哪些文件", Icon: FolderTree },
];

/** Two-way segmented switch; the thumb slides under the picked side. ←/→ switch too. */
function ViewSwitch({ view, onView, compact }: { view: SeriesView; onView: (view: SeriesView) => void; compact: boolean }) {
  const group = useRef<HTMLDivElement>(null);
  const pick = (next: SeriesView) => {
    onView(next);
    requestAnimationFrame(() => group.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus());
  };
  return (
    <div ref={group} role="radiogroup" aria-label="视图"
      onKeyDown={e => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        pick(view === "files" ? "structured" : "files");
      }}
      className="relative my-1.5 grid shrink-0 grid-cols-2 rounded-lg bg-surface-2/70 p-0.5 ring-1 ring-inset ring-border-solid">
      <span aria-hidden className={`absolute inset-y-0.5 start-0.5 w-[calc(50%-2px)] rounded-md bg-surface-3 shadow-sm ring-1 ring-border-solid transition-transform duration-200 ease-out motion-reduce:transition-none ${view === "files" ? "translate-x-full rtl:-translate-x-full" : ""}`} />
      {VIEWS.map(({ id, label, title, Icon }) => {
        const on = view === id;
        return (
          <button key={id} type="button" role="radio" aria-checked={on} aria-label={label} tabIndex={on ? 0 : -1} title={title}
            onClick={() => pick(id)}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/60 ${on ? "text-heading" : "text-muted hover:text-body"}`}>
            <Icon size={13} aria-hidden className={`transition-colors ${on ? "text-primary" : ""}`} />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}

/** Where the files view is: project / folder / … / file. Folders reveal themselves in the tree. */
function Crumbs({ root, path, onRoot, onDir }: { root: string; path: string; onRoot: () => void; onDir: (dir: string) => void }) {
  const parts = path ? path.split("/") : [];
  const end = useRef<HTMLSpanElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", inline: "end" }); }, [path]);
  const seg = "shrink-0 rounded px-1.5 py-0.5 transition-colors hover:bg-surface-2 hover:text-heading";
  return (
    <nav aria-label="路径" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-2 text-sm text-muted [scrollbar-width:none]">
      <button type="button" onClick={onRoot} title="项目目录" className={`inline-flex items-center gap-1.5 ${seg} ${parts.length ? "" : "text-heading"}`}>
        <FolderTree size={14} aria-hidden className="text-primary" />{root || "项目目录"}
      </button>
      {parts.map((part, i) => {
        const last = i === parts.length - 1;
        const dir = parts.slice(0, i + 1).join("/");
        return (
          <span key={dir} ref={last ? end : undefined} className="inline-flex shrink-0 items-center gap-0.5">
            <ChevronRight size={12} aria-hidden className="text-dim rtl:-scale-x-100" />
            {last
              ? <span aria-current="page" className="px-1.5 py-0.5 text-heading">{part}</span>
              : <button type="button" onClick={() => onDir(dir)} title="在目录里显示" className={seg}>{part}</button>}
          </span>
        );
      })}
    </nav>
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
  if (hasNewer(item)) return <StatusPill tone="newer" title={`定稿的是 ${shortVersion(item.canonical!)}，最新是 ${shortVersion(item.latest)}`}>有新稿</StatusPill>;
  return <StatusPill tone={state} />;
}

function Card({ item, src, chatRef, onClick, onRef, picker }: {
  item: StatusItem;
  src: (url: string) => string;
  chatRef: ChatRef;
  onClick: () => void;
  onRef: (ref: ChatRef) => void;
  picker: React.ReactNode;
}) {
  const state = itemState(item);
  const final = canFinal(item);
  const newer = hasNewer(item);
  return (
    <li className={`group relative flex flex-col rounded-lg border bg-surface transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-within:z-20 has-[[aria-expanded=true]]:z-30 ${state === "stale" ? "border-spark-flare/40" : "border-border-solid"} ${state === "deprecated" ? "opacity-50" : ""}`}>
      <button type="button" onClick={onClick} draggable onDragStart={e => dragRef(e, chatRef)} title={`${item.label}\n点开查看 · 拖到对话 = 引用`}
        className="flex w-full flex-col text-left">
        <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-t-[7px] bg-surface-2">
          {item.thumb
            ? <img src={src(item.thumb)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
            : item.media_kind === "video"
              ? <Video size={28} aria-hidden className="text-dim" />
              : <KindIcon kind={item.kind} size={28} className="text-dim" />}
        </div>
        <div className="flex w-full items-center gap-2 px-2.5 pt-2">
          <span className="min-w-0 flex-1 truncate text-sm text-heading">{shortLabel(item)}</span>
          {!final && <Pill item={item} />}
        </div>
      </button>
      <div className="flex min-h-[2.25rem] items-center gap-2 px-2.5 pb-2 pt-1 text-[11px] tabular-nums text-dim">
        <span className="min-w-0 flex-1 truncate">
          {!final ? `最新 ${shortVersion(item.latest)}`
            : newer ? <span className="text-spark-blue">新稿 {shortVersion(item.latest)}</span>
            : state === "stale" ? <span className="text-spark-flare">上游改了</span>
            : state === "canonical" ? "最终使用"
            : `最新 ${shortVersion(item.latest)}`}
        </span>
        {picker}
      </div>
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
