/**
 * /business/c/:companyId/chat — department chat + live task rail.
 *
 * State lives in ChatProvider; this view renders dept list, message stream
 * (with refs / local cards), pending-ref chips, and "dispatch as task".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, TaskState } from "../../../lib/api";
import type { ChatRef } from "../../../lib/chatRefs";
import { Markdown } from "../../../components/ui/Markdown";
import { ChatWaitingBubble, TypingDots, waitingMark } from "../../../components/ui/ChatWaiting";
import { useToast } from "../../../components/ui/Toast";
import { useDeptChat, resolveDeptDisplay, type ChatTurn } from "./ChatProvider";

type Ctx = { company: Company };

const LIVE: TaskState[] = ["pending", "in_progress"];
const POLL_MS = 4000;

function titleFromBrief(brief: string): string {
  const line = brief.trim().split(/\r?\n/)[0] ?? "";
  return line.slice(0, 30) || line;
}

export default function ChatView() {
  useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const chat = useDeptChat();
  const {
    company,
    depts,
    deptsLoading,
    reloadDepts,
    deptId,
    setDeptId,
    turns,
    draft,
    setDraft,
    pendingRefs,
    removePendingRef,
    sending,
    canChat,
    selectedDept,
    selectedDeptLabel,
    historyLoading,
    send,
    appendLocalTurn,
    resumeTask,
    resumingTaskId,
  } = chat;

  useEffect(() => {
    void reloadDepts();
  }, [reloadDepts]);

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [dispatchTitle, setDispatchTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deptTasks, setDeptTasks] = useState<Task[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, sending]);

  // Live tasks for the selected department (right rail + event cards).
  useEffect(() => {
    if (!deptId) {
      setDeptTasks([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      api
        .get<{ items: Task[] }>(`/v1/companies/${company.id}/tasks`)
        .then((r) => {
          if (cancelled) return;
          const mine = r.items.filter((tk) => tk.dept_id === deptId);
          setDeptTasks(mine);

          // Insert local event cards for state transitions we haven't shown.
          for (const tk of mine) {
            if (tk.state === "failed") {
              const key = `failed:${tk.id}:${tk.progress}`;
              if (!seenEvents.current.has(key)) {
                seenEvents.current.add(key);
                if (isPoll) {
                  appendLocalTurn({
                    role: "local",
                    kind: "task_event",
                    taskId: tk.id,
                    taskTitle: tk.title,
                    event: "failed",
                  });
                  appendLocalTurn({
                    role: "local",
                    kind: "resume_prompt",
                    taskId: tk.id,
                    taskTitle: tk.title,
                  });
                }
              }
            } else if (tk.state === "done") {
              const key = `done:${tk.id}`;
              if (!seenEvents.current.has(key)) {
                seenEvents.current.add(key);
                if (isPoll) {
                  appendLocalTurn({
                    role: "local",
                    kind: "task_event",
                    taskId: tk.id,
                    taskTitle: tk.title,
                    event: "done",
                    detail: t("business.company.chat.local.artifacts-count", {
                      count: tk.artifact_ids?.length ?? 0,
                    }),
                  });
                }
              }
            }
          }

          if (mine.some((tk) => LIVE.includes(tk.state))) {
            timer = setTimeout(() => load(true), POLL_MS);
          }
        })
        .catch(() => {
          /* rail is best-effort */
        });
    };

    load(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [company.id, deptId, appendLocalTurn, t]);

  const openDispatch = (brief: string) => {
    const text = brief.trim();
    if (!text || !deptId) return;
    setDispatchBrief(text);
    setDispatchTitle(titleFromBrief(text));
    setDispatchOpen(true);
  };

  const confirmDispatch = async () => {
    const brief = dispatchBrief.trim();
    const title = dispatchTitle.trim() || titleFromBrief(brief);
    if (!brief || !deptId || submitting) return;
    setSubmitting(true);
    try {
      const task = await api.post<{ id: string; title?: string }>(
        `/v1/companies/${company.id}/tasks`,
        {
          title,
          brief,
          dept_id: deptId,
          expected_artifacts: ["markdown"],
        },
      );
      appendLocalTurn({
        role: "local",
        kind: "task_dispatched",
        taskId: task.id,
        taskTitle: task.title || title,
      });
      if (draft.trim() === brief) setDraft("");
      setDispatchOpen(false);
    } catch (e) {
      toast.error(apiErrorMessage(e, t("business.company.chat.dispatch.error")));
    } finally {
      setSubmitting(false);
    }
  };

  const deptIds =
    depts.length > 0
      ? depts.map((d) => d.id)
      : company.dept_ids;

  const liveTasks = useMemo(
    () => deptTasks.filter((tk) => LIVE.includes(tk.state) || tk.state === "failed"),
    [deptTasks],
  );
  const deptDisplay = resolveDeptDisplay(selectedDept?.id || deptId, depts);
  const waitingLabel = t("business.company.chat.waiting", {
    name: deptDisplay.name || t("business.company.chat.speaker.agent"),
  });
  const quickPrompts = [
    t("business.company.chat.empty.prompt.plan"),
    t("business.company.chat.empty.prompt.review"),
    t("business.company.chat.empty.prompt.next"),
  ];

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 shrink-0">
        <h1 className="font-display text-lg text-heading">
          {t("business.company.chat.title")}
        </h1>
        <p className="text-xs text-muted">{t("business.company.chat.subtitle")}</p>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left — department list */}
        <aside className="w-44 shrink-0 border-e border-border-solid bg-surface/40 overflow-y-auto py-2">
          <div className="px-3 py-1 text-xs uppercase tracking-widest text-muted">
            {t("business.company.conversations.dept-label")}
          </div>
          <nav className="flex flex-col">
            {deptsLoading && deptIds.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">{t("common.loading")}…</p>
            ) : (
              deptIds.map((id) => {
                const active = id === deptId;
                const { label } = resolveDeptDisplay(id, depts);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDeptId(id)}
                    className={`px-3 py-2 text-sm text-start transition-colors border-s-2 ${
                      active
                        ? "border-primary text-primary bg-surface-2"
                        : "border-transparent text-body hover:text-primary hover:bg-surface-2"
                    }`}
                  >
                    {label}
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        {/* Center — messages + input */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div
            role="log"
            aria-label={t("business.company.chat.history-label")}
            aria-live="polite"
            aria-busy={sending}
            tabIndex={0}
            className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary/50"
          >
            {turns.length === 0 && historyLoading && (
              <div className="h-full grid place-items-center text-sm text-muted">
                {t("business.company.chat.history-loading")}
              </div>
            )}
            {turns.length === 0 && !historyLoading && selectedDept && (
              <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center py-10 text-center">
                <div className="text-4xl" aria-hidden>💬</div>
                <h2 className="mt-3 font-display text-xl text-heading">
                  {t("business.company.chat.empty.title", { name: selectedDeptLabel })}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                  {t("business.company.chat.empty.hint")}
                </p>
                <div className="mt-5 flex w-full flex-col gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={!canChat}
                      onClick={() => setDraft(prompt)}
                      className="rounded-md border border-border-solid bg-surface px-4 py-2 text-start text-sm text-body transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.length === 0 && !historyLoading && !selectedDept && (
              <p className="text-sm text-muted">
                {t("business.company.conversations.empty")}
              </p>
            )}
            {turns.map((turn, i) => (
              <TurnRow
                key={i}
                turn={turn}
                companyId={company.id}
                deptName={
                  selectedDept
                    ? resolveDeptDisplay(selectedDept.id, depts).name
                    : resolveDeptDisplay(deptId, depts).name
                }
                onResume={(taskId) => void resumeTask(taskId)}
                resuming={resumingTaskId === (turn.role === "local" && "taskId" in turn ? turn.taskId : "")}
              />
            ))}
            {sending && (
              <ChatWaitingBubble
                mark={waitingMark(deptDisplay.emoji, deptDisplay.name)}
                speaker={deptDisplay.name || t("business.company.chat.speaker.agent")}
                label={waitingLabel}
              />
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-border-solid shrink-0 space-y-2">
            {pendingRefs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingRefs.map((ref) => (
                  <RefChip
                    key={`${ref.type}:${ref.id}:${ref.taskId ?? ""}`}
                    refItem={ref}
                    onRemove={() => removePendingRef(ref)}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  pendingRefs.length
                    ? t("business.company.chat.placeholder-with-refs")
                    : t("business.company.conversations.placeholder")
                }
                disabled={sending || !canChat}
                className="flex-1 bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => openDispatch(draft)}
                disabled={sending || !draft.trim() || !deptId || !canChat}
                className="rounded-md border border-border-solid px-3 py-2 text-sm text-body hover:text-primary hover:border-primary disabled:opacity-50"
              >
                {t("business.company.chat.dispatch.action")}
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !draft.trim() || !canChat}
                aria-label={sending ? waitingLabel : undefined}
                className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium disabled:opacity-50 min-w-[4.5rem] inline-flex items-center justify-center"
              >
                {sending ? <TypingDots dotClassName="bg-bg" /> : t("business.company.conversations.send")}
              </button>
            </div>
            <p className="text-xs text-muted">
              {t("business.company.chat.composer-hint")}
            </p>
            {company.state === "provisioning" ? (
              <p className="text-xs text-muted">
                {t("business.company.conversations.provisioning")}
              </p>
            ) : company.state !== "running" ? (
              <p className="text-xs text-muted">
                {t("business.company.conversations.not-ready", {
                  state: company.state,
                })}
              </p>
            ) : null}
          </div>
        </div>

        {/* Right — department tasks */}
        <aside className="hidden xl:flex w-56 shrink-0 border-s border-border-solid bg-surface/30 flex-col min-h-0">
          <div className="px-3 py-2 text-xs uppercase tracking-widest text-muted border-b border-border-solid">
            {t("business.company.chat.rail.title")}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {liveTasks.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted">
                {t("business.company.chat.rail.empty")}
              </p>
            ) : (
              liveTasks.map((tk) => (
                <TaskRailCard
                  key={tk.id}
                  task={tk}
                  companyId={company.id}
                  onDiscuss={() =>
                    chat.bringToChat(deptId, [
                      {
                        type: "task",
                        id: tk.id,
                        taskId: tk.id,
                        label: tk.title,
                        detail: t("business.company.chat.ref.status", {
                          state: t(`task.state.${tk.state}`),
                        }),
                      },
                    ])
                  }
                  onSolve={
                    tk.state === "failed"
                      ? () =>
                          chat.bringToChat(
                            deptId,
                            [
                              {
                                type: "task",
                                id: tk.id,
                                taskId: tk.id,
                                label: tk.title,
                                detail: t("business.company.chat.ref.status", {
                                  state: t("task.state.failed"),
                                }),
                              },
                            ],
                            {
                              draft: t("business.company.chat.solve.draft", {
                                title: tk.title,
                              }),
                            },
                          )
                      : undefined
                  }
                />
              ))
            )}
          </div>
        </aside>
      </div>

      {dispatchOpen && (
        <DispatchConfirm
          title={dispatchTitle}
          brief={dispatchBrief}
          deptLabel={selectedDeptLabel || resolveDeptDisplay(deptId, depts).label}
          submitting={submitting}
          onTitleChange={setDispatchTitle}
          onBriefChange={setDispatchBrief}
          onCancel={() => {
            if (!submitting) setDispatchOpen(false);
          }}
          onConfirm={() => void confirmDispatch()}
        />
      )}
    </div>
  );
}

function RefChip({
  refItem,
  onRemove,
  readonly,
}: {
  refItem: ChatRef;
  onRemove?: () => void;
  readonly?: boolean;
}) {
  const { t } = useTranslation();
  const typeKey = `business.company.chat.ref.${refItem.type}`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-heading max-w-full">
      <span className="text-xs uppercase tracking-wider text-muted shrink-0">
        {t(typeKey)}
      </span>
      <span className="truncate">{refItem.label}</span>
      {!readonly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted hover:text-fusion shrink-0"
          aria-label={t("business.company.chat.ref.remove")}
        >
          ✕
        </button>
      )}
    </span>
  );
}

function TurnRow({
  turn,
  companyId,
  deptName,
  onResume,
  resuming,
}: {
  turn: ChatTurn;
  companyId: string;
  deptName: string;
  onResume: (taskId: string) => void;
  resuming: boolean;
}) {
  const { t } = useTranslation();

  if (turn.role === "local") {
    if (turn.kind === "task_dispatched") {
      const copyKey = turn.auto
        ? "business.company.chat.local.auto-dispatched"
        : "business.company.chat.local.dispatched";
      return (
        <LocalCard
          label={t("business.company.chat.local.record-label")}
          body={t(copyKey, { title: turn.taskTitle })}
          link={`/business/c/${companyId}/tasks/${turn.taskId}`}
          linkLabel={t("business.company.chat.local.view-task")}
        />
      );
    }
    if (turn.kind === "task_resumed") {
      return (
        <LocalCard
          label={t("business.company.chat.local.record-label")}
          body={t("business.company.chat.local.resumed", { title: turn.taskTitle })}
          link={`/business/c/${companyId}/tasks/${turn.taskId}`}
          linkLabel={t("business.company.chat.local.view-task")}
        />
      );
    }
    if (turn.kind === "task_event") {
      const copyKey =
        turn.event === "failed"
          ? "business.company.chat.local.event-failed"
          : turn.event === "done"
            ? "business.company.chat.local.event-done"
            : "business.company.chat.local.event-artifact";
      return (
        <LocalCard
          label={t("business.company.chat.local.record-label")}
          body={t(copyKey, { title: turn.taskTitle, detail: turn.detail || "" })}
          link={`/business/c/${companyId}/tasks/${turn.taskId}`}
          linkLabel={t("business.company.chat.local.view-task")}
          tone={turn.event === "failed" ? "danger" : "ok"}
        />
      );
    }
    if (turn.kind === "resume_prompt") {
      return (
        <div className="rounded-md border border-fusion/30 bg-fusion/5 px-3 py-2.5 text-sm">
          <p className="text-heading leading-snug">
            {t("business.company.chat.resume.prompt", { title: turn.taskTitle })}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={resuming}
              onClick={() => onResume(turn.taskId)}
              className="rounded-md bg-primary text-bg px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              {resuming
                ? t("business.company.chat.resume.submitting")
                : t("business.company.chat.resume.confirm")}
            </button>
            <Link
              to={`/business/c/${companyId}/tasks/${turn.taskId}`}
              className="rounded-md border border-border-solid px-3 py-1 text-xs text-body hover:text-primary"
            >
              {t("business.company.chat.local.view-task")}
            </Link>
          </div>
        </div>
      );
    }
    return null;
  }

  const message = turn;
  const speakerLabel =
    message.role === "user"
      ? t("business.company.chat.speaker.you")
      : message.label && !message.label.startsWith("dept-")
        ? message.label
        : deptName || t("business.company.chat.speaker.agent");
  return (
    <div
      className={`text-sm ${
        message.role === "user" ? "text-heading" : "text-body"
      }`}
    >
      <div className="text-xs uppercase tracking-widest text-muted mb-1">
        {speakerLabel}
      </div>
      {message.refs && message.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {message.refs.map((ref) => (
            <RefChip
              key={`${ref.type}:${ref.id}`}
              refItem={ref}
              readonly
            />
          ))}
        </div>
      )}
      {message.role === "assistant" ? (
        <Markdown text={message.text} />
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
      )}
    </div>
  );
}

function LocalCard({
  label,
  body,
  link,
  linkLabel,
  tone = "primary",
}: {
  label: string;
  body: string;
  link: string;
  linkLabel: string;
  tone?: "primary" | "danger" | "ok";
}) {
  const border =
    tone === "danger"
      ? "border-fusion/30 bg-fusion/5"
      : tone === "ok"
        ? "border-spark-mint/30 bg-spark-mint/5"
        : "border-primary/30 bg-primary/5";
  return (
    <div className={`rounded-md border ${border} px-3 py-2.5 text-sm`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-widest text-muted">
          {label}
        </span>
        <Link
          to={link}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
      <p className="mt-1.5 text-heading leading-snug">{body}</p>
    </div>
  );
}

function TaskRailCard({
  task,
  companyId,
  onDiscuss,
  onSolve,
}: {
  task: Task;
  companyId: string;
  onDiscuss: () => void;
  onSolve?: () => void;
}) {
  const { t } = useTranslation();
  const step = (task.plan || []).find((s) => s.status === "running" || s.status === "failed")
    || (task.plan || [])[(task.plan || []).length - 1];
  return (
    <div className="rounded-md border border-border-solid bg-surface px-2.5 py-2 text-xs">
      <div className="flex items-start justify-between gap-1">
        <Link
          to={`/business/c/${companyId}/tasks/${task.id}`}
          className="text-heading hover:text-primary truncate font-medium"
        >
          {task.title}
        </Link>
        <span className={task.state === "failed" ? "text-fusion shrink-0" : "text-muted shrink-0"}>
          {t(`task.state.${task.state}`)}
        </span>
      </div>
      {step && (
        <div className="mt-1 text-muted truncate">
          {step.label || step.key}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onDiscuss}
          className="text-primary hover:underline"
        >
          {t("business.company.chat.bring")}
        </button>
        {onSolve && (
          <button
            type="button"
            onClick={onSolve}
            className="text-fusion hover:underline"
          >
            {t("business.company.chat.solve.action")}
          </button>
        )}
      </div>
    </div>
  );
}

function DispatchConfirm({
  title,
  brief,
  deptLabel,
  submitting,
  onTitleChange,
  onBriefChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  brief: string;
  deptLabel: string;
  submitting: boolean;
  onTitleChange: (v: string) => void;
  onBriefChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 bg-bg/80 backdrop-blur flex items-center justify-center z-50 p-6"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-border-solid rounded-md max-w-lg w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-solid flex items-center justify-between">
          <div className="text-sm text-heading">
            {t("business.company.chat.dispatch.confirm-title")}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-muted hover:text-primary disabled:opacity-50"
          >
            ✕
          </button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-xs text-muted">
            {t("business.company.chat.dispatch.dept", { dept: deptLabel })}
          </p>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-widest text-muted">
              {t("business.company.chat.dispatch.field-title")}
            </span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={submitting}
              className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-widest text-muted">
              {t("business.company.chat.dispatch.field-brief")}
            </span>
            <textarea
              value={brief}
              onChange={(e) => onBriefChange(e.target.value)}
              rows={4}
              disabled={submitting}
              className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>
        <footer className="px-4 py-3 border-t border-border-solid flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-border-solid px-4 py-1.5 text-xs text-body hover:text-primary disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !brief.trim()}
            className="rounded-md bg-primary text-bg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {submitting
              ? t("business.company.chat.dispatch.submitting")
              : t("business.company.chat.dispatch.confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}
