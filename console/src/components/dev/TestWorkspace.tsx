import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

import { api, apiErrorMessage } from "../../lib/api";
import type { BuilderDraft, ChatMsg } from "../../lib/builderFixtures";
import { extractTryReply } from "../../lib/tryChatReply";
import { sandboxScope } from "../../lib/workspaceScope";
import { useHorizontalSplit } from "../../hooks/useHorizontalSplit";
import { FilesPanel, PreviewPane } from "../studio";
import { TaskCreateFlow } from "../tasks/TaskCreateFlow";
import { outputTaskForContext } from "../../lib/tasks";
import { WorkspaceTasks } from "../tasks/WorkspaceTasks";
import { OutputsPane } from "../outputs/OutputsPane";
import { ChatMedia } from "../ui/ChatMedia";
import { Markdown } from "../ui/Markdown";
import { TypingDots } from "../ui/ChatWaiting";

type Panel = "department" | "chat" | "tasks";
type Props = {
  draft: BuilderDraft;
  messages: ChatMsg[];
  onSend: (text: string) => void;
  onCancel: () => void;
  onSendToRecruiter: (text: string) => void;
  busy: boolean;
  ready: boolean;
  connectError: string | null;
  toolStatus: string | null;
};

/** Sandbox workspace: department source; chat and task outputs on the right. */
export function TestWorkspace(props: Props) {
  const { draft } = props;
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const panelParam = params.get("panel");
  const panel: Panel = panelParam === "chat" || panelParam === "outputs" ? "chat"
    : panelParam === "tasks" ? "tasks" : "department";
  const mobileRight = params.get("focus") === "right" || (panel === "department" && params.get("focus") !== "main");
  const selectedTask = params.get("task") || undefined;
  const scope = useMemo(() => sandboxScope(draft.id), [draft.id]);
  const [creating, setCreating] = useState(false);
  const [taskSeed, setTaskSeed] = useState("");
  const [expanded, setExpanded] = useState<"main" | "right" | null>(null);
  const { containerRef, ratio, onPointerDown, onKeyDown } = useHorizontalSplit({
    storageKey: "lgh.studioTest.split", initialRatio: 0.6, minStart: 300, minEnd: 340,
  });
  useEffect(() => { setExpanded(null); }, [panel, draft.id]);

  const selectPanel = (nextPanel: Panel) => {
    setExpanded(null);
    const next = new URLSearchParams(params);
    next.set("panel", nextPanel);
    next.delete("right");
    next.set("focus", nextPanel === "department" ? "right" : "main");
    setParams(next);
    if (nextPanel !== "tasks") setCreating(false);
  };
  const createFromChat = (goal: string) => {
    setTaskSeed(goal);
    setCreating(true);
    selectPanel("tasks");
  };
  const createdTask = (id: string) => {
    setExpanded(null);
    setCreating(false);
    const next = new URLSearchParams(params);
    next.set("panel", "tasks");
    next.delete("right");
    next.set("focus", "main");
    next.delete("kind");
    next.set("task", id);
    setParams(next);
  };
  const setFocus = (focus: "main" | "right") => {
    setExpanded(null);
    const next = new URLSearchParams(params);
    next.set("focus", focus);
    setParams(next);
  };
  const nav: { id: Panel; label: string; icon: string }[] = [
    { id: "department", label: t("dev.studio.test.department"), icon: "▦" },
    { id: "chat", label: t("dev.studio.test.chat"), icon: "💬" },
    { id: "tasks", label: t("dev.studio.test.tasks"), icon: "⚡" },
  ];
  const rightLabel = t(panel === "department" ? "dev.studio.test.source" : "outputs.title");
  const resizeLabel = t("dev.studio.test.resize", { main: nav.find((item) => item.id === panel)?.label, right: rightLabel });
  const toggleExpanded = (pane: "main" | "right") => setExpanded((current) => current === pane ? null : pane);
  const mainDisplay = expanded === "main" ? "flex" : expanded === "right" ? "hidden" : mobileRight ? "hidden lg:flex" : "flex";
  const rightDisplay = expanded === "right" ? "flex" : expanded === "main" ? "hidden" : mobileRight ? "flex" : "hidden lg:flex";

  return (
    <div className="flex-1 flex min-h-0 min-w-0 bg-bg">
      <aside className={`${expanded ? "hidden" : "block"} w-12 shrink-0 border-e border-border-solid bg-surface/60 py-3 sm:w-36`} aria-label={t("dev.studio.test.workspace-nav")}>
        <nav className="flex flex-col">
          {nav.map((item) => (
            <button key={item.id} type="button" aria-current={panel === item.id ? "page" : undefined}
              aria-label={item.label} title={item.label}
              onClick={() => selectPanel(item.id)}
              className={`border-s-2 px-3 py-2 text-start text-sm transition-colors sm:px-4 ${
                panel === item.id ? "border-primary bg-surface-2 text-primary" : "border-transparent text-body hover:bg-surface-2 hover:text-primary"
              }`}>
              <span className="sm:me-2" aria-hidden>{item.icon}</span><span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div ref={containerRef} data-expanded={expanded || undefined}
        className="studio-test-panes flex flex-1 min-w-0 min-h-0"
        style={{ "--studio-test-split": `${ratio * 100}%` } as CSSProperties}
        onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) setExpanded(null); }}>
        <div className={`${mainDisplay} studio-test-main min-w-0 min-h-0 flex-col`}>
          <div className="flex shrink-0 items-center justify-between border-b border-border-solid px-4 py-1.5 text-xs text-muted lg:hidden">
            <span>{nav.find((item) => item.id === panel)?.label}</span>
            <button type="button" onClick={() => setFocus("right")} className="text-primary hover:underline">
              {t(panel === "department" ? "dev.studio.test.source" : "dev.studio.test.outputs")} →
            </button>
          </div>
          <div className={`${panel === "chat" ? "flex" : "hidden"} flex-1 min-h-0 min-w-0`}>
            <TestChat {...props} active={panel === "chat" && expanded !== "right" && (expanded === "main" || !mobileRight)}
              expanded={expanded === "main"} onExpand={() => toggleExpanded("main")} onCreateTask={createFromChat} />
          </div>
          {panel === "department" && <div className="flex flex-1 min-h-0 min-w-0 flex-col">
            <header className="shrink-0 border-b border-border-solid bg-surface/60 px-5 py-3">
              <h2 className="font-display text-lg text-heading">{draft.emoji} {draft.name}</h2>
              {draft.mission && <p className="mt-1 text-xs text-muted">{draft.mission}</p>}
            </header>
            <PreviewPane draft={draft} />
          </div>}
          {panel === "tasks" ? (
            creating ? <SandboxTaskNew draftId={draft.id} initialGoal={taskSeed}
              onCancel={() => setCreating(false)} onCreated={createdTask} />
              : <WorkspaceTasks scope={scope} className="h-full" showOutputs={false}
                onCreate={() => { setTaskSeed(""); setCreating(true); }} />
          ) : null}
        </div>

        {!expanded && <div role="separator" aria-orientation="vertical" aria-label={resizeLabel}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} tabIndex={0}
          onPointerDown={onPointerDown} onKeyDown={onKeyDown} title={resizeLabel}
          className="group hidden lg:flex w-2 touch-none shrink-0 cursor-col-resize items-center justify-center border-x border-border-solid/60 bg-surface/60 hover:bg-primary/10 focus-visible:bg-primary/10">
          <span className="h-10 w-0.5 rounded-full bg-muted/60 transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>}
        <div className={`${rightDisplay} studio-test-right max-w-full min-w-0 min-h-0 flex-col`}>
          {panel === "department" && <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-solid bg-surface/60 px-3 py-1.5">
            <span className="min-w-0 truncate text-xs text-muted">{rightLabel}</span>
            <div className="flex shrink-0 items-center gap-2">
              <PaneSizeButton name={rightLabel} expanded={expanded === "right"} onClick={() => toggleExpanded("right")} />
              <button type="button" onClick={() => setFocus("main")} className="text-xs text-primary hover:underline lg:hidden">
                {t("dev.studio.test.back-to-workspace")}
              </button>
            </div>
          </div>}
          <div className="flex flex-1 min-h-0 min-w-0">
            {panel === "department" ? <FilesPanel draft={draft} width="100%" title={t("dev.studio.test.source")} />
              : <OutputsPane scope={scope} taskId={panel === "tasks" ? outputTaskForContext(params.get("file"), selectedTask) : undefined} className="flex-1"
                headerActions={<>
                  <PaneSizeButton name={rightLabel} expanded={expanded === "right"} onClick={() => toggleExpanded("right")} />
                  <button type="button" onClick={() => setFocus("main")} aria-label={t("dev.studio.test.back-to-workspace")} title={t("dev.studio.test.back-to-workspace")}
                    className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1 text-xs text-primary hover:bg-surface-2 lg:hidden">
                    <ArrowLeft size={14} aria-hidden /><span>{t("dev.studio.test.back-to-workspace")}</span>
                  </button>
                </>} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaneSizeButton({ name, expanded, onClick }: { name: string; expanded: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const label = t(expanded ? "dev.studio.test.restore" : "dev.studio.test.expand", { name });
  const Icon = expanded ? Minimize2 : Maximize2;
  return <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={expanded}
    className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border-solid px-2 py-1 text-xs text-body hover:border-primary hover:text-primary">
    <Icon size={14} aria-hidden /><span className="hidden sm:inline">{label}</span>
  </button>;
}

function TestChat({ draft, messages, onSend, onCancel, onSendToRecruiter, onCreateTask,
  busy, ready, connectError, toolStatus, active, expanded, onExpand,
}: Props & { onCreateTask: (goal: string) => void; active: boolean; expanded: boolean; onExpand: () => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessage?.text, busy, toolStatus, active]);
  const submit = () => {
    const text = input.trim();
    if (!text || !ready || busy) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="studio-test-chat flex flex-1 min-h-0 min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-solid bg-surface/60 px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-heading">{t("dev.studio.test.chat")}</h2>
          <p className="text-xs text-muted">{t("dev.studio.test.chat-hint", { name: draft.name })}</p>
        </div>
        <PaneSizeButton name={t("dev.studio.test.chat")} expanded={expanded} onClick={onExpand} />
      </header>
      <div ref={scrollRef} role="log" aria-live="polite" aria-busy={busy} className="flex-1 min-h-0 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="text-4xl" aria-hidden>💬</div>
            <h3 className="mt-3 font-display text-xl text-heading">{t("dev.studio.test.empty-title", { name: draft.name })}</h3>
            <p className="mt-2 text-sm text-muted">{t("dev.studio.chat.try-empty")}</p>
          </div>
        )}
        {messages.map((message) => {
          if (message.role === "copilot" && !message.text && !message.media?.length) return null;
          const assistant = message.role === "copilot";
          return (
            <div key={message.id} className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-md border px-3 py-2 text-sm leading-relaxed ${
                assistant ? "border-border-solid bg-surface text-body" : "border-primary/20 bg-primary/10 text-heading"
              }`}>
                {assistant ? <>
                  <div className={`mb-1 text-[11px] font-medium ${message.source === "sub" ? "text-spark-blue" : "text-primary"}`}>
                    {message.label || `${draft.emoji || ""} ${draft.name}`.trim()}
                  </div>
                  {message.text && <Markdown text={extractTryReply(message.text) || message.text} />}
                  <ChatMedia media={message.media} />
                  {message.text && <button type="button" onClick={() => onSendToRecruiter(message.text)} className="mt-2 text-xs text-primary hover:underline">
                    {t("dev.studio.chat.send-to-recruiter")}
                  </button>}
                </> : <p className="whitespace-pre-wrap">{message.text}</p>}
              </div>
            </div>
          );
        })}
        {busy && <div className="w-fit rounded-md border border-border-solid bg-surface px-3 py-2 text-xs text-muted">
          <span className="me-2 text-primary">{draft.name}</span><TypingDots label={toolStatus || t("dev.studio.chat.try-waiting")} />
        </div>}
      </div>
      <div className="shrink-0 border-t border-border-solid p-4 space-y-2">
        {connectError && <p role="alert" className="text-xs text-fusion">{connectError}</p>}
        <div className="studio-test-compose-row flex gap-2 items-end">
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={connectError || (ready ? t("dev.studio.chat.try-placeholder") : t("dev.studio.chat.try-connecting"))}
            disabled={!ready || busy} rows={2}
            className="studio-test-compose-input min-w-0 flex-1 resize-y rounded border border-border-solid bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary disabled:opacity-60" />
          {busy ? <button type="button" onClick={onCancel} className="rounded-md border border-border-solid px-3 py-2 text-sm text-body hover:text-fusion">{t("dev.studio.chat.cancel")}</button>
            : <>
              <button type="button" disabled={!input.trim()} onClick={() => onCreateTask(input.trim())}
                className="rounded-md border border-border-solid px-3 py-2 text-sm text-body hover:border-primary hover:text-primary disabled:opacity-50">{t("dev.studio.test.to-task")}</button>
              <button type="button" disabled={!ready || !input.trim()} onClick={submit}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50">{t("dev.studio.chat.send")}</button>
            </>}
        </div>
        <p className="text-xs text-muted">{t("dev.studio.test.chat-note")}</p>
      </div>
    </div>
  );
}

function SandboxTaskNew({ draftId, initialGoal, onCancel, onCreated }: {
  draftId: string; initialGoal: string;
  onCancel: () => void; onCreated: (id: string) => void;
}) {
  const scope = useMemo(() => sandboxScope(draftId), [draftId]);
  return <div className="flex-1 min-w-0 overflow-auto"><TaskCreateFlow scope={scope}
    leadDeptId={draftId} initialGoal={initialGoal}
    onCancel={onCancel} onCreated={onCreated} /></div>;
}
