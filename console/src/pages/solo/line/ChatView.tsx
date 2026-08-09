/**
 * /solo/l/:lineId/chat — full-page team chat.
 *
 * State lives in ChatProvider; this view only renders the team list, message
 * stream, input, and the "dispatch as task" confirm layer.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { Markdown } from "../../../components/ui/Markdown";
import { useToast } from "../../../components/ui/Toast";
import { useTeamChat, resolveDeptDisplay, type ChatTurn } from "./ChatProvider";

type Ctx = { line: Company };

function titleFromBrief(brief: string): string {
  const line = brief.trim().split(/\r?\n/)[0] ?? "";
  return line.slice(0, 30) || line;
}

export default function ChatView() {
  useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const chat = useTeamChat();
  const {
    line,
    depts,
    deptsLoading,
    deptId,
    setDeptId,
    turns,
    draft,
    setDraft,
    sending,
    canChat,
    selectedDept,
    selectedDeptLabel,
    send,
    appendLocalTurn,
  } = chat;

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [dispatchTitle, setDispatchTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, sending]);

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
        `/v1/lines/${line.id}/tasks`,
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
      toast.error(apiErrorMessage(e, t("solo.line.chat.dispatch.error")));
    } finally {
      setSubmitting(false);
    }
  };

  const deptIds =
    depts.length > 0
      ? depts.map((d) => d.id)
      : line.dept_ids;

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 shrink-0">
        <h1 className="font-display text-lg text-heading">
          {t("solo.line.chat.title")}
        </h1>
        <p className="text-xs text-muted">{t("solo.line.chat.subtitle")}</p>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-48 shrink-0 border-e border-border-solid bg-surface/40 overflow-y-auto py-2">
          <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-muted">
            {t("solo.line.conversations.team-label")}
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

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto">
            {turns.length === 0 && (
              <p className="text-sm text-muted">
                {selectedDept
                  ? t("solo.line.conversations.hint", {
                      team: selectedDeptLabel,
                    })
                  : t("solo.line.conversations.empty")}
              </p>
            )}
            {turns.map((turn, i) => (
              <TurnRow
                key={i}
                turn={turn}
                lineId={line.id}
                deptName={
                  selectedDept
                    ? resolveDeptDisplay(selectedDept.id, depts).name
                    : resolveDeptDisplay(deptId, depts).name
                }
                onConvert={() => {
                  if (turn.role === "assistant") openDispatch(turn.text);
                }}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-border-solid shrink-0 space-y-2">
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
                placeholder={t("solo.line.conversations.placeholder")}
                disabled={sending || !canChat}
                className="flex-1 bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => openDispatch(draft)}
                disabled={sending || !draft.trim() || !deptId || !canChat}
                className="rounded-md border border-border-solid px-3 py-2 text-sm text-body hover:text-primary hover:border-primary disabled:opacity-50"
              >
                {t("solo.line.chat.dispatch.action")}
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !draft.trim() || !canChat}
                className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {sending ? "…" : t("solo.line.conversations.send")}
              </button>
            </div>
            {line.state === "provisioning" ? (
              <p className="text-xs text-muted">
                {t("solo.line.conversations.provisioning")}
              </p>
            ) : line.state !== "running" ? (
              <p className="text-xs text-muted">
                {t("solo.line.conversations.not-ready", {
                  state: line.state,
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {dispatchOpen && (
        <DispatchConfirm
          title={dispatchTitle}
          brief={dispatchBrief}
          teamLabel={selectedDeptLabel || resolveDeptDisplay(deptId, depts).label}
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

function TurnRow({
  turn,
  lineId,
  deptName,
  onConvert,
}: {
  turn: ChatTurn;
  lineId: string;
  deptName: string;
  onConvert: () => void;
}) {
  const { t } = useTranslation();

  if (turn.role === "local") {
    const copyKey = turn.auto
      ? "solo.line.chat.local.auto-dispatched"
      : "solo.line.chat.local.dispatched";
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            {t("solo.line.chat.local.record-label")}
          </span>
          <Link
            to={`/solo/l/${lineId}/tasks/${turn.taskId}`}
            className="shrink-0 text-xs text-primary hover:underline"
          >
            {t("solo.line.chat.local.view-task")}
          </Link>
        </div>
        <p className="mt-1.5 text-heading leading-snug">
          {t(copyKey, { title: turn.taskTitle })}
        </p>
      </div>
    );
  }

  const message = turn;
  const speakerLabel =
    message.role === "user"
      ? "你"
      : message.label && !message.label.startsWith("dept-")
        ? message.label
        : deptName || "Agent";
  return (
    <div
      className={`text-sm ${
        message.role === "user" ? "text-heading" : "text-body"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
        {speakerLabel}
      </div>
      {message.role === "assistant" ? (
        <Markdown text={message.text} />
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
      )}
      {message.role === "assistant" && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onConvert}
            className="text-[11px] text-primary/80 hover:text-primary transition-colors"
          >
            {t("solo.line.chat.convert.action")}
          </button>
        </div>
      )}
    </div>
  );
}

function DispatchConfirm({
  title,
  brief,
  teamLabel,
  submitting,
  onTitleChange,
  onBriefChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  brief: string;
  teamLabel: string;
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
            {t("solo.line.chat.dispatch.confirm-title")}
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
            {t("solo.line.chat.dispatch.team", { team: teamLabel })}
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              {t("solo.line.chat.dispatch.field-title")}
            </span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={submitting}
              className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              {t("solo.line.chat.dispatch.field-brief")}
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
              ? t("solo.line.chat.dispatch.submitting")
              : t("solo.line.chat.dispatch.confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}
