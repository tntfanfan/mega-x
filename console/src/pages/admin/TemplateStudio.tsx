import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage, type Me } from "../../lib/api";
import type { BuilderDraft, ChatMsg } from "../../lib/builderFixtures";
import { RecruiterWs } from "../../lib/recruiterWs";
import {
  type ChatMode,
  FilesPanel,
  PreviewPane,
  VibeChat,
  loadPaneWidth,
  usePaneResize,
} from "../../components/studio";
import { useToast } from "../../components/ui/Toast";

const CHAT_WIDTH_KEY = "admin.studio.chat-width";
const FILES_WIDTH_KEY = "admin.studio.files-width";

type EditMeta = {
  dept_id?: string;
  editor_user_id?: string;
  state?: string;
  base_tree_hash?: string;
  base_commit?: string | null;
  applied_commit?: string | null;
};

type TemplateDraft = BuilderDraft & {
  edit?: EditMeta;
  pending?: { count: number; uncommitted: boolean; has_changes?: boolean };
};

type DiffFile = {
  path: string;
  status: "added" | "modified" | "deleted";
  diff_lines: number;
  diff?: string;
};

function draftCanTry(d: BuilderDraft | null): boolean {
  if (!d) return false;
  const files = d.files ?? [];
  return files.some(
    (f) =>
      (f.name === "SOUL.md" || f.name === "AGENTS.md")
      && (f.content?.trim().length ?? 0) >= 40,
  ) || (d.agents?.length ?? 0) > 0;
}

function DiffLine({ line }: { line: string }) {
  const kind = line.startsWith("+") && !line.startsWith("+++")
    ? "add"
    : line.startsWith("-") && !line.startsWith("---")
      ? "del"
      : "ctx";
  const cls = kind === "add"
    ? "text-spark-mint bg-spark-mint/10"
    : kind === "del"
      ? "text-fusion bg-fusion/10"
      : "text-muted";
  return <div className={`px-1 ${cls}`}>{line || " "}</div>;
}

export default function AdminTemplateStudio() {
  const { deptId } = useParams<{ deptId: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tryMessages, setTryMessages] = useState<ChatMsg[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>("recruiter");
  const [userId, setUserId] = useState("user-dev-0001");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tryBusy, setTryBusy] = useState(false);
  const [trySessionId, setTrySessionId] = useState<string | undefined>();
  const [composeSeed, setComposeSeed] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [diffs, setDiffs] = useState<DiffFile[]>([]);
  const [uncommitted, setUncommitted] = useState(false);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<Record<string, unknown> | null>(null);
  const wsRef = useRef<RecruiterWs | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const tryAbortRef = useRef<AbortController | null>(null);
  const [chatWidth, setChatWidth] = useState(() => loadPaneWidth(CHAT_WIDTH_KEY, 280, 720, 420));
  const [filesWidth, setFilesWidth] = useState(() => loadPaneWidth(FILES_WIDTH_KEY, 240, 860, 360));
  const onChatResizeStart = usePaneResize(chatWidth, setChatWidth, {
    key: CHAT_WIDTH_KEY, min: 280, max: 720, side: "end",
  });
  const onFilesResizeStart = usePaneResize(filesWidth, setFilesWidth, {
    key: FILES_WIDTH_KEY, min: 240, max: 860, side: "start",
  });

  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    (async () => {
      try {
        // POST reuse=true opens or resumes. Do not GET first: no staging is a
        // documented 404 and Chrome logs it as a failed load; StrictMode then
        // double-POSTs and the second call used to 409 the same admin.
        const body = await api.post<TemplateDraft>(
          `/v1/admin/templates/${deptId}/edit?reuse=true`,
        );
        if (!cancelled) setDraft(body);
      } catch (e) {
        if (!cancelled) setLoadError(apiErrorMessage(e, t("admin.templates.edit-failed")));
      }
    })();
    return () => { cancelled = true; };
  }, [deptId, t]);

  useEffect(() => {
    let cancelled = false;
    api.get<Me>("/v1/me").then((m) => {
      if (!cancelled && m?.user?.id) setUserId(m.user.id);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!deptId || !userId || !draft) return;
    const client = new RecruiterWs(userId, deptId, {
      onUserText: (text) => {
        setMessages((cur) => [...cur, { id: `h-u-${Date.now()}`, role: "user", text }]);
      },
      onAssistantText: (text) => {
        setMessages((cur) => [...cur, { id: `h-a-${Date.now()}`, role: "copilot", text }]);
      },
      onAssistantReset: () => {
        const id = `c-${Date.now()}`;
        streamingIdRef.current = id;
        setMessages((cur) => [...cur, { id, role: "copilot", text: "" }]);
      },
      onAssistantDelta: (text) => {
        const id = streamingIdRef.current;
        if (!id) {
          const nid = `c-${Date.now()}`;
          streamingIdRef.current = nid;
          setMessages((cur) => [...cur, { id: nid, role: "copilot", text }]);
          return;
        }
        setMessages((cur) => {
          const idx = cur.findIndex((m) => m.id === id);
          if (idx === -1) return [...cur, { id, role: "copilot", text }];
          return cur.map((m) => (m.id === id ? { ...m, text: m.text + text } : m));
        });
      },
      onToolUse: (name) => setToolStatus(name.replace(/^mcp__recruiter__/, "")),
      onDraftUpdate: (d) => {
        if (d && typeof d === "object") {
          setDraft(d as TemplateDraft);
          setToolStatus(null);
        }
      },
      onDone: () => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
        setMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text)));
      },
      onError: (message) => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
        setMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text)));
        toast.error(message);
      },
    }, { wsPath: "/v1/admin/templates/ws" });
    wsRef.current = client;
    client.connect(true);
    return () => {
      client.close();
      wsRef.current = null;
    };
  }, [deptId, userId, draft?.id, toast]);

  const onSend = useCallback((text: string) => {
    setMessages((cur) => [...cur, { id: `u-${Date.now()}`, role: "user", text }]);
    setBusy(true);
    streamingIdRef.current = null;
    wsRef.current?.sendPrompt(text);
  }, []);

  const onCancel = useCallback(() => {
    if (chatMode === "try") {
      tryAbortRef.current?.abort();
      tryAbortRef.current = null;
      setTryBusy(false);
      return;
    }
    wsRef.current?.cancel();
  }, [chatMode]);

  const onTrySend = useCallback(async (text: string) => {
    if (!deptId || tryBusy) return;
    setTryMessages((cur) => [...cur, { id: `tu-${Date.now()}`, role: "user", text }]);
    setTryBusy(true);
    const ac = new AbortController();
    tryAbortRef.current = ac;
    try {
      const res = await api.post<{ ok: boolean; reply: string; session_id?: string; error?: string }>(
        `/v1/admin/templates/${deptId}/try_chat`,
        { message: text, session_id: trySessionId },
        { signal: ac.signal },
      );
      if (res.session_id) setTrySessionId(res.session_id);
      setTryMessages((cur) => [
        ...cur,
        { id: `tc-${Date.now()}`, role: "copilot", text: res.reply || res.error || "(空回复)" },
      ]);
    } catch (e) {
      if (ac.signal.aborted) return;
      const err = apiErrorMessage(e, t("dev.studio.chat.try-error"));
      setTryMessages((cur) => [...cur, { id: `tc-err-${Date.now()}`, role: "copilot", text: err }]);
      toast.error(err);
    } finally {
      if (tryAbortRef.current === ac) tryAbortRef.current = null;
      setTryBusy(false);
    }
  }, [deptId, tryBusy, trySessionId, toast, t]);

  const onSendToRecruiter = useCallback((snippet: string) => {
    setChatMode("recruiter");
    setComposeSeed(t("dev.studio.chat.fix-prompt", { text: snippet.trim().slice(0, 1200) }));
  }, [t]);

  const openDiff = async () => {
    if (!deptId) return;
    try {
      const res = await api.get<{ files: DiffFile[]; uncommitted?: boolean }>(`/v1/admin/templates/${deptId}/diff`);
      setDiffs(res.files || []);
      setUncommitted(Boolean(res.uncommitted));
      setOpenPath(res.files?.[0]?.path ?? null);
      setApplyResult(null);
      setDiffOpen(true);
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.diff-failed")));
    }
  };

  const goConfirm = () => {
    setCommitMsg(t("admin.templates.commit-default", { id: deptId }));
    setDiffOpen(false);
    setConfirmOpen(true);
  };

  const doApply = async () => {
    if (!deptId || !draft?.edit?.base_tree_hash) return;
    setApplying(true);
    try {
      const res = await api.post<Record<string, unknown>>(`/v1/admin/templates/${deptId}/apply`, {
        confirm: true,
        expected_base_hash: draft.edit.base_tree_hash,
        commit_message: commitMsg || undefined,
      });
      setApplyResult(res);
      setConfirmOpen(false);
      if (res.ok) {
        toast.info(t("admin.templates.apply-ok"));
        navigate("/admin/templates");
        return;
      }
      if (res.code === "push_failed") {
        toast.error(t("admin.templates.push-failed"));
      } else {
        toast.error(String(res.push_error || res.store_sync_error || t("admin.templates.apply-failed")));
      }
      const next = await api.get<TemplateDraft>(`/v1/admin/templates/${deptId}/edit`);
      setDraft(next);
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.apply-failed")));
    } finally {
      setApplying(false);
    }
  };

  const retryPush = async () => {
    if (!deptId) return;
    try {
      const res = await api.post<Record<string, unknown>>(`/v1/admin/templates/${deptId}/apply/retry_push`);
      setApplyResult(res);
      toast.info(t("admin.templates.retry-ok"));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.retry-failed")));
    }
  };

  if (loadError) {
    return (
      <section className="container py-10">
        <Link to="/admin/templates" className="text-xs text-muted hover:text-primary">{t("admin.templates.back-list")}</Link>
        <p className="mt-4 text-fusion text-sm">{loadError}</p>
      </section>
    );
  }
  if (!draft) {
    return <section className="container py-10"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  }

  const grouped = {
    added: diffs.filter((d) => d.status === "added"),
    modified: diffs.filter((d) => d.status === "modified"),
    deleted: diffs.filter((d) => d.status === "deleted"),
  };
  const selected = diffs.find((d) => d.path === openPath);
  const emptyDiff = diffs.length === 0;
  const canApply = Boolean(
    draft.pending?.has_changes
    || (draft.pending?.count ?? 0) > 0
    || draft.pending?.uncommitted
    || diffs.length > 0
    || uncommitted,
  );
  const editState = draft.edit?.state || "editing";

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      <header className="border-b border-border-solid bg-surface px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/templates" className="text-xs text-muted hover:text-primary shrink-0">
            {t("admin.templates.back-list")}
          </Link>
          <span className="text-2xl shrink-0">{draft.emoji}</span>
          <div className="min-w-0">
            <h1 className="font-display text-lg text-heading truncate">{draft.name}</h1>
            <p className="text-[11px] text-muted font-mono">
              {draft.id}
              {draft.edit?.base_commit ? ` · ${String(draft.edit.base_commit).slice(0, 8)}` : ""}
              {editState !== "applied" ? ` · ${t(`admin.templates.state.${editState}`, { defaultValue: editState })}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {applyResult && applyResult.code === "push_failed" && (
            <button
              type="button"
              onClick={() => { void retryPush(); }}
              className="rounded-md border border-fusion/40 px-3 py-1.5 text-xs text-fusion hover:bg-fusion/10"
            >
              {t("admin.templates.retry-push")}
            </button>
          )}
          <button
            type="button"
            disabled={!canApply}
            onClick={() => { void openDiff(); }}
            className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
          >
            {t("admin.templates.confirm")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <FilesPanel draft={draft} width={filesWidth} />
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onFilesResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors -ms-1.5 relative z-10"
        />
        <PreviewPane draft={draft} />
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onChatResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors -me-1.5 relative z-10"
        />
        <VibeChat
          width={chatWidth}
          mode={chatMode}
          onModeChange={setChatMode}
          canTry={draftCanTry(draft)}
          tryDisabledReason={t("dev.studio.chat.try-disabled")}
          deptLabel={`${draft.emoji || ""} ${draft.name}`.trim()}
          messages={chatMode === "try" ? tryMessages : messages}
          onSend={chatMode === "try" ? (text) => { void onTrySend(text); } : onSend}
          onCancel={onCancel}
          busy={chatMode === "try" ? tryBusy : busy}
          toolStatus={chatMode === "try" ? null : toolStatus}
          composeSeed={chatMode === "recruiter" ? composeSeed : null}
          onComposeSeedConsumed={() => setComposeSeed(null)}
          onSendToRecruiter={onSendToRecruiter}
          recruiterEmptyKey="admin.templates.chat-empty"
        />
      </div>

      {diffOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-surface border border-border-solid rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-3 border-b border-border-solid flex items-center justify-between">
              <h2 className="font-display text-heading">{t("admin.templates.diff-title")}</h2>
              <button type="button" onClick={() => setDiffOpen(false)} className="text-muted hover:text-body">✕</button>
            </div>
            {emptyDiff && !uncommitted ? (
              <p className="p-6 text-sm text-muted">{t("admin.templates.diff-empty")}</p>
            ) : emptyDiff && uncommitted ? (
              <p className="p-6 text-sm text-muted">{t("admin.templates.diff-uncommitted")}</p>
            ) : (
              <div className="flex-1 min-h-0 flex">
                <aside className="w-56 shrink-0 border-e border-border-solid overflow-y-auto p-3 text-xs space-y-3">
                  {(["added", "modified", "deleted"] as const).map((k) => (
                    grouped[k].length ? (
                      <div key={k}>
                        <p className="uppercase tracking-wider text-muted mb-1">
                          {t(`admin.templates.diff.${k}`)} ({grouped[k].length})
                        </p>
                        {grouped[k].map((f) => (
                          <button
                            key={f.path}
                            type="button"
                            onClick={() => setOpenPath(f.path)}
                            className={`block w-full text-start font-mono truncate py-0.5 ${
                              openPath === f.path ? "text-primary" : "text-body hover:text-primary"
                            }`}
                          >
                            {f.path}
                          </button>
                        ))}
                      </div>
                    ) : null
                  ))}
                </aside>
                <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                  {selected?.diff
                    ? selected.diff.split("\n").map((line, i) => <DiffLine key={i} line={line} />)
                    : t("admin.templates.diff-binary")}
                </pre>
              </div>
            )}
            <div className="px-5 py-3 border-t border-border-solid flex justify-end gap-2">
              <button type="button" onClick={() => setDiffOpen(false)} className="rounded-md border border-border-solid px-3 py-1.5 text-xs">
                {t("admin.templates.cancel")}
              </button>
              <button
                type="button"
                disabled={!canApply}
                onClick={goConfirm}
                className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {t("admin.templates.continue-apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-surface border border-border-solid rounded-lg w-full max-w-lg p-5 space-y-4">
            <h2 className="font-display text-heading">{t("admin.templates.confirm-title")}</h2>
            <p className="text-sm text-body">{t("admin.templates.confirm-body", { id: deptId })}</p>
            <label className="block text-xs text-muted">
              {t("admin.templates.commit-label")}
              <input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                className="mt-1 w-full bg-bg border border-border-solid rounded px-3 py-1.5 text-sm text-body outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-md border border-border-solid px-3 py-1.5 text-xs">
                {t("admin.templates.cancel")}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); }}
                className="rounded-md border border-border-solid px-3 py-1.5 text-xs"
              >
                {t("admin.templates.keep-staging")}
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => { void doApply(); }}
                className="rounded-md bg-fusion text-bg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {applying ? t("admin.templates.applying") : t("admin.templates.overwrite")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
