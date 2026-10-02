import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUp, Maximize2, Minimize2, Plus, Square } from "lucide-react";

import { api, apiErrorMessage } from "../../lib/api";
import type { BuilderDraft, ChatMsg } from "../../lib/builderFixtures";
import { extractTryReply, type TryChatSession } from "../../lib/tryChatReply";
import { sandboxScope } from "../../lib/workspaceScope";
import { useHorizontalSplit } from "../../hooks/useHorizontalSplit";
import { FilesPanel, PreviewPane } from "../studio";
import { TaskCreateFlow } from "../tasks/TaskCreateFlow";
import { outputTaskForContext } from "../../lib/tasks";
import { WorkspaceTasks } from "../tasks/WorkspaceTasks";
import { OutputsPane } from "../outputs/OutputsPane";
import { OutputInteractionProvider, useOutputInteractions } from "../outputs/OutputInteractionProvider";
import { OutputRefChip } from "../chat/OutputRefChip";
import { OutputAwareMarkdown } from "../chat/OutputAwareMarkdown";
import { OutputMentionMenu } from "../chat/OutputMentionMenu";
import { activeMention, messageId, type MentionQuery } from "../../lib/outputRefs";
import { refKey } from "../../lib/chatRefs";
import type { OutputFile } from "../../lib/outputs";
import type { SendTryMessage } from "../../lib/tryChatWs";
import { ChatMedia } from "../ui/ChatMedia";
import { TypingDots } from "../ui/ChatWaiting";

type Panel = "department" | "chat" | "tasks";
type Props = {
  draft: BuilderDraft;
  workspaceKey: string;
  sessionId: string;
  sessions: TryChatSession[];
  onSessionChange: (id: string) => void;
  onSessionCreate: () => void;
  creatingSession: boolean;
  messages: ChatMsg[];
  onSend: (message: SendTryMessage) => boolean;
  onRecoverSubmission: (message: SendTryMessage) => void;
  onCancel: () => void;
  busy: boolean;
  ready: boolean;
  connectError: string | null;
  toolStatus: string | null;
};

/** Sandbox workspace: department source; chat and task outputs on the right. */
export function TestWorkspace(props: Props) {
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<"right" | null>(null);
  const scope = useMemo(() => sandboxScope(props.draft.id), [props.draft.id]);
  const open = (path: string) => {
    setExpanded(null);
    const next = new URLSearchParams(params);
    if (!next.get("panel") || ["department", "outputs"].includes(next.get("panel"))) next.set("panel", "chat");
    next.set("file", path); next.set("focus", "right"); next.delete("right");
    if (next.get("panel") === "tasks") {
      const match = /^tasks\/([^/]+)\/runs\/([^/]+)\//.exec(path);
      if (match) { next.set("task", match[1]); next.set("run", match[2]); }
      else { next.delete("task"); next.delete("run"); }
    }
    setParams(next);
  };
  const focusChat = () => {
    setExpanded(null);
    const next = new URLSearchParams(params);
    next.set("panel", "chat"); next.set("focus", "main"); next.delete("right");
    setParams(next);
  };
  return <OutputInteractionProvider key={props.workspaceKey} scope={scope} workspaceKey={props.workspaceKey}
    selectedPath={params.get("file") || undefined}
    messages={props.messages} busy={props.busy} taskId={params.get("panel") === "tasks" ? params.get("task") || undefined : undefined}
    onRecoverSubmission={props.onRecoverSubmission}
    onOpen={open} onFocusChat={focusChat}>
    <TestWorkspaceContent {...props} expanded={expanded} setExpanded={setExpanded} />
  </OutputInteractionProvider>;
}

function TestWorkspaceContent(props: Props & { expanded: "right" | null; setExpanded: Dispatch<SetStateAction<"right" | null>> }) {
  const { draft } = props;
  const { scope, draft: chatDraft, nodes, referenceOutput, revealToken, fileStates, openOutput } = useOutputInteractions();
  const { expanded, setExpanded } = props;
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const panelParam = params.get("panel");
  const panel: Panel = panelParam === "chat" || panelParam === "outputs" ? "chat"
    : panelParam === "tasks" ? "tasks" : "department";
  const mobileRight = params.get("focus") === "right" || (panel === "department" && params.get("focus") !== "main");
  const selectedTask = params.get("task") || undefined;
  const [creating, setCreating] = useState(false);
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
  const toggleExpanded = () => setExpanded((current) => current ? null : "right");
  const mainDisplay = expanded ? "hidden" : mobileRight ? "hidden lg:flex" : "flex";
  const rightDisplay = expanded || mobileRight ? "flex" : "hidden lg:flex";

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
          {panel !== "chat" && <div className="flex shrink-0 items-center justify-between border-b border-border-solid px-4 py-1.5 text-xs text-muted lg:hidden">
            <span>{nav.find((item) => item.id === panel)?.label}</span>
            <button type="button" onClick={() => setFocus("right")} className="text-primary hover:underline">
              {t(panel === "department" ? "dev.studio.test.source" : "dev.studio.test.outputs")} →
            </button>
          </div>}
          <div className={`${panel === "chat" ? "flex" : "hidden"} flex-1 min-h-0 min-w-0`}>
            <TestChat {...props} onShowOutputs={() => setFocus("right")} />
          </div>
          {panel === "department" && <div className="flex flex-1 min-h-0 min-w-0 flex-col">
            <header className="shrink-0 border-b border-border-solid bg-surface/60 px-5 py-3">
              <h2 className="font-display text-lg text-heading">{draft.emoji} {draft.name}</h2>
              {draft.mission && <p className="mt-1 text-xs text-muted">{draft.mission}</p>}
            </header>
            <PreviewPane draft={draft} />
          </div>}
          {panel === "tasks" ? (
            creating ? <SandboxTaskNew draftId={draft.id}
              onCancel={() => setCreating(false)} onCreated={createdTask} />
              : <WorkspaceTasks scope={scope} className="h-full" showOutputs={false}
                onCreate={() => setCreating(true)} />
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
              <PaneSizeButton name={rightLabel} expanded={expanded === "right"} onClick={toggleExpanded} />
              <button type="button" onClick={() => setFocus("main")} className="text-xs text-primary hover:underline lg:hidden">
                {t("dev.studio.test.back-to-workspace")}
              </button>
            </div>
          </div>}
          <div className="flex flex-1 min-h-0 min-w-0">
            {panel === "department" ? <FilesPanel draft={draft} width="100%" title={t("dev.studio.test.source")} />
              : <OutputsPane scope={scope} taskId={panel === "tasks" ? outputTaskForContext(params.get("file"), selectedTask) : undefined} className="flex-1"
                sharedNodes={nodes} revealToken={revealToken} onUserSelect={referenceOutput}
                onRetryOutput={openOutput}
                referencedPaths={new Set(chatDraft.refs.filter(ref => ref.type === "output").map(ref => ref.path))}
                selectedError={fileStates[params.get("file") || ""] ? t(`outputs.refs.${fileStates[params.get("file") || ""]}`) : undefined}
                headerActions={<>
                  <PaneSizeButton name={rightLabel} expanded={expanded === "right"} onClick={toggleExpanded} />
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

function TestChat({ draft, messages, onSend, onCancel,
  busy, ready, connectError, toolStatus, sessionId, sessions, onSessionChange, onSessionCreate, creatingSession, onShowOutputs,
}: Props & { onShowOutputs: () => void }) {
  const { t } = useTranslation();
  const { draft: chatDraft, setText: setInput, removeReference, toggleReferencePin, referenceOutput, focusToken, beginSubmission } = useOutputInteractions();
  const sessionOptions = sessions.some(session => session.session_id === sessionId) ? sessions : [{ session_id: sessionId }, ...sessions];
  const input = chatDraft.text;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionFiles = useRef<OutputFile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessage?.text, busy, toolStatus]);
  useEffect(() => { if (focusToken) inputRef.current?.focus(); }, [focusToken]);
  const chooseMention = (file: OutputFile) => {
    if (!mention || !referenceOutput(file)) return;
    const next = input.slice(0, mention.start) + input.slice(mention.end);
    const caret = mention.start;
    setInput(next); setMention(null);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(caret, caret); });
  };
  const submit = () => {
    const text = input.trim() || (chatDraft.refs.length ? t("outputs.refs.default-message") : "");
    if (!text || !ready || busy || chatDraft.submission) return;
    const keys = JSON.stringify(chatDraft.refs.map(refKey).sort());
    const failed = [...messages].reverse().find(m => m.status === "failed" && m.text === text &&
      JSON.stringify((m.refs || []).map(refKey).sort()) === keys);
    const id = failed?.clientMessageId || messageId();
    const message = { clientMessageId: id, text, refs: chatDraft.refs, retry: !!failed };
    if (onSend(message)) beginSubmission(message);
  };

  return (
    <div className="studio-test-chat flex flex-1 min-h-0 min-w-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-solid bg-surface/60 px-3">
        <h2 className="min-w-0 flex-1 truncate text-xs uppercase tracking-widest text-muted">{t("dev.studio.test.chat")}</h2>
        <select value={sessionId} onChange={event => onSessionChange(event.target.value)} disabled={creatingSession}
          aria-label={t("dev.studio.chat.sessions")}
          className="h-7 min-w-0 max-w-36 rounded-md border border-border-solid bg-surface px-2 text-xs text-body disabled:opacity-50">
          {sessionOptions.map(session => <option key={session.session_id} value={session.session_id}>
            {session.title || (session.session_id === `try-${draft.id}` ? t("dev.studio.chat.session-default") :
              `${t("dev.studio.chat.session-new")}${session.created_at ? ` · ${new Date(session.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}`)}
          </option>)}
        </select>
        <button type="button" onClick={onSessionCreate} disabled={creatingSession}
          aria-label={t("dev.studio.chat.new-session")} title={t("dev.studio.chat.new-session")}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary disabled:opacity-50">
          <Plus size={15} aria-hidden />
        </button>
        <button type="button" onClick={onShowOutputs} className="shrink-0 text-xs text-primary hover:underline lg:hidden">
          {t("dev.studio.test.outputs")} →
        </button>
      </header>
      <div ref={scrollRef} role="log" aria-live="polite" aria-busy={busy} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-5 py-3">
        {messages.map((message) => {
          if (message.role === "copilot" && !message.text && !message.media?.length) return null;
          const assistant = message.role === "copilot";
          return (
            <div key={message.id} className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                assistant ? "border-border-solid bg-surface text-body" : "border-primary/20 bg-primary/10 text-heading"
              }`}>
                {assistant ? <>
                  <div className={`mb-1 text-[11px] font-medium ${message.source === "sub" ? "text-spark-blue" : "text-primary"}`}>
                    {message.label || `${draft.emoji || ""} ${draft.name}`.trim()}
                  </div>
                  {message.text && <OutputAwareMarkdown text={extractTryReply(message.text) || message.text} refs={message.refs} />}
                  <ChatMedia media={message.media} />
                </> : <OutputAwareMarkdown text={message.text} refs={message.refs} user />}
                {!!message.refs?.length && <div className="mt-2 flex flex-wrap gap-1.5">{message.refs.map(ref => <OutputRefChip key={refKey(ref)} refItem={ref}
                  showParent={message.refs.filter(item => item.label === ref.label).length > 1} />)}</div>}
                {message.status && message.status !== "accepted" && message.status !== "delivery_unknown" && <div className="mt-1 text-[11px] text-muted" role="status">
                  {t(`outputs.refs.status-${message.status}`)}
                </div>}
              </div>
            </div>
          );
        })}
        {busy && <div className="w-fit rounded-md border border-border-solid bg-surface px-3 py-2 text-xs text-muted">
          <span className="me-2 text-primary">{draft.name}</span><TypingDots label={toolStatus || t("dev.studio.chat.try-waiting")} />
        </div>}
      </div>
      <div className="shrink-0 p-4 pt-2 space-y-2">
        {connectError && <p role="alert" className="text-xs text-fusion">{connectError}</p>}
        {!!chatDraft.refs.length && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted">{t("outputs.refs.referenced")}</span>
          {chatDraft.refs.map(ref => <OutputRefChip key={refKey(ref)} refItem={ref} onRemove={() => removeReference(ref)}
            pinned={chatDraft.pinnedRefKeys.includes(refKey(ref))} onTogglePin={() => toggleReferencePin(ref)}
            showParent={chatDraft.refs.filter(item => item.label === ref.label).length > 1} />)}
        </div>}
        <div className="studio-test-compose-row relative flex items-end gap-2 rounded-2xl border border-border-solid bg-surface p-2 transition-colors focus-within:border-primary/60">
          {mention && <OutputMentionMenu query={mention.query} activeIndex={mentionIndex} onIndex={setMentionIndex}
            onResults={files => { mentionFiles.current = files; }} onSelect={chooseMention} />}
          <textarea ref={inputRef} value={input} onChange={(e) => {
            setInput(e.target.value);
            mentionFiles.current = [];
            if (!composing.current) { setMention(activeMention(e.target.value, e.target.selectionStart)); setMentionIndex(0); }
          }}
            onSelect={e => { if (!composing.current) setMention(activeMention(e.currentTarget.value, e.currentTarget.selectionStart)); }}
            onClick={e => { if (!composing.current) setMention(activeMention(input, e.currentTarget.selectionStart)); }}
            onCompositionStart={() => { composing.current = true; setMention(null); }}
            onCompositionEnd={e => { composing.current = false; setMention(activeMention(e.currentTarget.value, e.currentTarget.selectionStart)); }}
            onKeyDown={e => {
              if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (mention && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
              if (mention && ["ArrowDown", "ArrowUp"].includes(e.key) && mentionFiles.current.length) {
                e.preventDefault(); setMentionIndex(index => (index + (e.key === "ArrowDown" ? 1 : -1) + mentionFiles.current.length) % mentionFiles.current.length); return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (mention) { if (mentionFiles.current[mentionIndex]) chooseMention(mentionFiles.current[mentionIndex]); return; }
                submit();
              }
            }}
            aria-controls={mention ? "output-mention-list" : undefined}
            aria-expanded={!!mention} aria-autocomplete="list" aria-activedescendant={mention && mentionFiles.current.length ? `output-mention-${mentionIndex}` : undefined}
            aria-label={t("dev.studio.chat.try-placeholder")}
            placeholder={ready ? t("dev.studio.chat.try-placeholder") : t("dev.studio.chat.try-connecting")}
            rows={2}
            className="studio-test-compose-input min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-body placeholder:text-muted outline-none" />
          {busy ? <button type="button" onClick={onCancel} aria-label={t("dev.studio.chat.cancel")} title={t("dev.studio.chat.cancel")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-solid text-body transition-colors hover:text-fusion">
            <Square size={14} aria-hidden />
          </button>
            : <button type="button" disabled={!ready || (!input.trim() && !chatDraft.refs.length) || !!chatDraft.submission} onClick={submit}
              aria-label={t("dev.studio.chat.send")} title={t("dev.studio.chat.send")}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-bg transition-opacity hover:opacity-90 disabled:opacity-30">
              <ArrowUp size={18} aria-hidden />
            </button>}
        </div>
      </div>
    </div>
  );
}

function SandboxTaskNew({ draftId, onCancel, onCreated }: {
  draftId: string;
  onCancel: () => void; onCreated: (id: string) => void;
}) {
  const scope = useMemo(() => sandboxScope(draftId), [draftId]);
  return <div className="flex-1 min-w-0 overflow-auto"><TaskCreateFlow scope={scope}
    leadDeptId={draftId}
    onCancel={onCancel} onCreated={onCreated} /></div>;
}
