/**
 * /dev/depts/:deptId/studio — For Builders Studio (Recruiter WS).
 *
 * Two-pane: Recruiter chat (claude-agent-sdk via /v1/dev/recruiter/ws) on the
 * start side; live preview on the end side driven by draft_update.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, X } from "lucide-react";

import { api, apiErrorMessage, type Me } from "../../lib/api";
import {
  loadTryChat,
  mergeTryHistory,
  saveTryChat,
  turnsToMessages,
} from "../../lib/tryChatReply";
import type {
  BuilderDraft, ChatMsg, SecurityReviewInfo,
} from "../../lib/builderFixtures";
import { estCostPerTask } from "../../lib/builderFixtures";
import { sanitizeDeptShort } from "../../lib/depts";
import { RecruiterWs } from "../../lib/recruiterWs";
import { TryChatWs } from "../../lib/tryChatWs";
import { SecurityReviewOverlay } from "../../components/SecurityReviewOverlay";
import {
  FilesPanel,
  PreviewPane,
  VibeChat,
  loadPaneWidth,
  usePaneResize,
} from "../../components/studio";
import { useToast } from "../../components/ui/Toast";
import { TestWorkspace } from "../../components/dev/TestWorkspace";

type RStatus = "pass" | "warn" | "fail" | "info";
interface Check { key: string; label: string; status: RStatus; detail?: string }

const STATUS_META: Record<RStatus, { icon: string; color: string }> = {
  pass: { icon: "✓", color: "text-spark-mint" },
  warn: { icon: "!", color: "text-spark-flare" },
  fail: { icon: "✕", color: "text-fusion" },
  info: { icon: "•", color: "text-spark-blue" },
};

const DRAFT_STATE_COLOR: Record<string, string> = {
  draft: "text-spark-flare",
  ready: "text-spark-mint",
  in_review: "text-spark-blue",
  published: "text-spark-mint",
  publishing: "text-spark-blue",
  publish_failed: "text-fusion",
};

function computeReadiness(draft: BuilderDraft, t: (k: string, options?: Record<string, string | number>) => string): Check[] {
  const hasOrch = draft.agents.some((a) => a.team_role === "orchestrator");
  const hasWorkers = draft.agents.some((a) => a.team_role !== "orchestrator");
  const hasWorkflow = Boolean(draft.workflow?.steps?.length);
  const agentsMd = draft.files.find((f) => f.name === "AGENTS.md" || f.name.endsWith("/AGENTS.md"));
  const adoptsOrchestration = Boolean(
    agentsMd?.content?.includes("agent-team-orchestration"),
  );
  const hasSpawnPrompts = Boolean(agentsMd?.content?.includes("Spawn Prompt"));
  const cost = estCostPerTask(draft.agents);
  return [
    { key: "soul", label: t("dev.studio.readiness.soul"), status: "pass" },
    { key: "orch", label: t("dev.studio.readiness.orchestrator"), status: hasOrch ? "pass" : "fail" },
    {
      key: "orchestration",
      label: t("dev.studio.readiness.orchestration"),
      status: adoptsOrchestration && hasSpawnPrompts ? "pass" : hasWorkers ? "fail" : "warn",
      detail: adoptsOrchestration && hasSpawnPrompts
        ? undefined
        : t("dev.studio.readiness.orchestration-warn"),
    },
    {
      key: "workflow",
      label: t("dev.studio.readiness.workflow"),
      status: hasWorkflow ? "pass" : hasWorkers ? "warn" : "fail",
      detail: hasWorkflow ? undefined : t("dev.studio.readiness.workflow-warn"),
    },
    { key: "mcp", label: t("dev.studio.readiness.mcp"), status: "pass", detail: t("dev.studio.readiness.mcp-relaxed") },
    {
      key: "danger",
      label: t("dev.studio.readiness.danger"),
      status: draft.security_review?.status === "passed" ? "pass"
        : draft.security_review?.status === "failed" ? "fail"
        : "warn",
      detail: draft.security_review?.status === "passed"
        ? t("dev.studio.review.badge-passed", { policy: draft.security_review.policy_version || "2" })
        : t("dev.studio.review.badge-needed"),
    },
    { key: "cost", label: t("dev.studio.readiness.cost"), status: "info", detail: `¥${cost.toFixed(2)}` },
  ];
}

const CHAT_WIDTH_KEY = "dev.studio.chat-width";
const CHAT_MIN_W = 280;
const CHAT_MAX_W = 720;
const FILES_WIDTH_KEY = "dev.studio.files-width";
const FILES_MIN_W = 240;
const FILES_MAX_W = 860;

function draftCanTry(d: BuilderDraft | null): boolean {
  if (!d) return false;
  const files = d.files ?? [];
  const hasBootstrap = files.some(
    (f) =>
      (f.name === "SOUL.md" || f.name === "AGENTS.md")
      && (f.content?.trim().length ?? 0) >= 40,
  );
  if (hasBootstrap) return true;
  // agents listed even if file bodies weren't hydrated yet
  return (d.agents?.length ?? 0) > 0;
}

export default function DevStudio() {
  const { deptId } = useParams<{ deptId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const testMode = searchParams.get("mode") === "test";
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tryMessages, setTryMessages] = useState<ChatMsg[]>([]);
  // develop = 文件/预览/对话；publish = 整页发布（就绪度）
  const [view, setView] = useState<"develop" | "publish">("develop");
  const [userId, setUserId] = useState("user-dev-0001");
  const [cellStatus, setCellStatus] = useState<string | null>(null);
  const [cellReady, setCellReady] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [tryToolStatus, setTryToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tryBusy, setTryBusy] = useState(false);
  const [tryReady, setTryReady] = useState(false);
  const [tryConnectError, setTryConnectError] = useState<string | null>(null);
  const [trySessionId, setTrySessionId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [liveReview, setLiveReview] = useState<SecurityReviewInfo | null>(null);
  /** Prefill chat composer when returning from a failed review. */
  const [composeSeed, setComposeSeed] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [renameSlug, setRenameSlug] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const renameNameRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<RecruiterWs | null>(null);
  const renamedDraftRef = useRef<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const tryWsRef = useRef<TryChatWs | null>(null);
  const tryStreamIds = useRef<Record<string, string>>({});
  const [chatWidth, setChatWidth] = useState<number>(
    () => loadPaneWidth(CHAT_WIDTH_KEY, CHAT_MIN_W, CHAT_MAX_W, 420),
  );
  const [filesWidth, setFilesWidth] = useState<number>(
    () => loadPaneWidth(FILES_WIDTH_KEY, FILES_MIN_W, FILES_MAX_W, 460),
  );
  // 聊天在最右（end 侧），文件在最左（start 侧）
  const onChatResizeStart = usePaneResize(chatWidth, setChatWidth, {
    key: CHAT_WIDTH_KEY, min: CHAT_MIN_W, max: CHAT_MAX_W, side: "end",
  });
  const onFilesResizeStart = usePaneResize(filesWidth, setFilesWidth, {
    key: FILES_WIDTH_KEY, min: FILES_MIN_W, max: FILES_MAX_W, side: "start",
  });

  // "new" is never used as a draft id — a fresh one is allocated server-side below.
  const draftId = deptId && deptId !== "new" ? deptId : null;
  const creatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.get<Me>("/v1/me").then((me) => {
      if (!cancelled && me?.user?.id) setUserId(me.user.id);
    }).catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, []);

  // Entering Studio always provisions/reuses this developer's DevCell.
  // Recruiter WS opens only after the container is running.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed = new Set(["unavailable", "error", "frozen"]);
    const tick = async () => {
      try {
        const r = await api.post<{ status?: string; error?: string }>("/v1/dev/cell");
        if (cancelled) return;
        const st = r.status || "unknown";
        setCellStatus(st);
        if (st === "running") {
          setCellError(null);
          setCellReady(true);
          return;
        }
        if (failed.has(st)) {
          setCellError(r.error || st);
          return;
        }
        timer = setTimeout(tick, 2000);
      } catch (e) {
        if (!cancelled) {
          setCellStatus("error");
          setCellError(apiErrorMessage(e, t("dev.studio.cell.unreachable")));
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [t]);

  // 新建部门 — allocate a fresh draft server-side, then swap the URL to its id
  // so every "new" opens a clean draft instead of the stale dept-untitled.
  useEffect(() => {
    if (deptId !== "new" || creatingRef.current) return;
    creatingRef.current = true;
    api
      .post<BuilderDraft>("/v1/dev/depts")
      .then((d) => navigate(`/dev/depts/${d.id}/studio`, { replace: true }))
      .catch((e) => {
        creatingRef.current = false;
        toast.error(apiErrorMessage(e, t("dev.studio.load-error")));
      });
  }, [deptId, navigate, toast, t]);

  // Reset view state when the bound draft changes (e.g. new-draft redirect).
  useEffect(() => {
    setDraft(null);
    setMessages([]);
    const cached = draftId ? loadTryChat(draftId) : null;
    setTryMessages(cached?.messages ?? []);
    setTrySessionId(cached?.session_id ?? (draftId ? `try-${draftId}` : undefined));
    setTryBusy(false);
    setTryReady(false);
    setTryConnectError(null);
    setTryToolStatus(null);
    tryStreamIds.current = {};
    setView("develop");
  }, [draftId]);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    api
      .get<{ session_id?: string; messages?: { role: string; text: string; media?: string[] }[] }>(
        `/v1/dev/depts/${draftId}/try_chat`,
      )
      .then((r) => {
        if (cancelled || !r.messages?.length) return;
        const msgs = turnsToMessages(r.messages);
        setTryMessages((cur) => mergeTryHistory(cur, msgs));
        const sid = r.session_id || `try-${draftId}`;
        setTrySessionId(sid);
      })
      .catch(() => { /* keep local cache */ });
    return () => { cancelled = true; };
  }, [draftId]);

  useEffect(() => {
    if (!draftId || tryMessages.length === 0) return;
    saveTryChat(draftId, {
      session_id: trySessionId || `try-${draftId}`,
      messages: tryMessages,
      mode: testMode ? "try" : "recruiter",
    });
  }, [draftId, tryMessages, trySessionId, testMode]);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    api
      .get<BuilderDraft>(`/v1/dev/depts/${draftId}`)
      .then((d) => { if (!cancelled) { setDraft(d); } })
      .catch((e) => toast.error(apiErrorMessage(e, t("dev.studio.load-error"))));
    return () => { cancelled = true; };
  }, [draftId, toast, t]);

  useEffect(() => {
    if (!draftId || !userId) return;
    // Clear before (re)connect so userId resolution / remount doesn't stack
    // a second history replay on top of the first.
    setMessages([]);
    renamedDraftRef.current = null;
    streamingIdRef.current = null;
    const client = new RecruiterWs(userId, draftId, {
      onUserText: (text) => {
        setMessages((cur) => [...cur, { id: `hu-${cur.length}`, role: "user", text }]);
      },
      onAssistantText: (text) => {
        // Session replay — full turn, not streamed. Must not go through
        // reset+delta (React 18 batches those against the same prev state and
        // the empty bubble gets hidden by the renderer).
        streamingIdRef.current = null;
        setMessages((cur) => [
          ...cur,
          { id: `ha-${cur.length}`, role: "copilot", text },
        ]);
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
        // If reset+first-delta land in the same React batch, the empty bubble
        // is not in `cur` yet — create-with-text instead of a no-op map.
        setMessages((cur) => {
          const idx = cur.findIndex((m) => m.id === id);
          if (idx === -1) {
            return [...cur, { id, role: "copilot", text }];
          }
          return cur.map((m) => (m.id === id ? { ...m, text: m.text + text } : m));
        });
      },
      onToolUse: (name) => {
        setToolStatus(name.replace(/^mcp__recruiter__/, ""));
      },
      onDraftUpdate: (d) => {
        if (d && typeof d === "object") {
          const updated = d as BuilderDraft;
          setDraft(updated);
          if (updated.id && updated.id !== draftId) {
            renamedDraftRef.current = updated.id;
          }
          setToolStatus(null);
        }
      },
      onDone: () => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
        // Drop empty streaming placeholders so they never linger / re-animate.
        setMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text)));
        const renamedId = renamedDraftRef.current;
        if (renamedId && renamedId !== draftId) {
          renamedDraftRef.current = null;
          navigate(`/dev/depts/${renamedId}/studio`, { replace: true });
        }
      },
      onError: (message) => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
        setMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text)));
        toast.error(message);
      },
    });
    wsRef.current = client;
    client.connect(true);
    return () => {
      client.close();
      wsRef.current = null;
    };
  }, [draftId, userId, navigate, toast]);

  const canTry = draftCanTry(draft);

  useEffect(() => {
    if (!testMode) {
      setTryReady(false);
      setTryBusy(false);
      setTryToolStatus(null);
      return;
    }
    if (!draftId || !userId || !canTry) return;
    setTryReady(false);
    const leadLabel = draft
      ? `${draft.emoji || ""} ${draft.name}`.trim()
      : "部长";
    const client = new TryChatWs(`/v1/dev/depts/${draftId}/try_ws`, {
      onReady: (info) => {
        setTryReady(true);
        setTryConnectError(null);
        if (info.session_id) setTrySessionId(info.session_id);
      },
      onClose: () => setTryReady(false),
      onStart: (key, source, label) => {
        if (tryStreamIds.current[key]) return;
        const id = `t-${key}-${Date.now()}`;
        tryStreamIds.current[key] = id;
        setTryMessages((cur) => [
          ...cur,
          { id, role: "copilot", text: "", source, label: label || leadLabel },
        ]);
      },
      onDelta: (key, source, label, text) => {
        let id = tryStreamIds.current[key];
        if (!id) {
          id = `t-${key}-${Date.now()}`;
          tryStreamIds.current[key] = id;
          setTryMessages((cur) => [
            ...cur,
            { id, role: "copilot", text, source, label: label || leadLabel },
          ]);
          return;
        }
        setTryMessages((cur) => {
          const idx = cur.findIndex((m) => m.id === id);
          if (idx === -1) {
            return [...cur, { id, role: "copilot", text, source, label: label || leadLabel }];
          }
          return cur.map((m) => (
            m.id === id
              ? { ...m, text: m.text + text, label: m.label || label || leadLabel, source }
              : m
          ));
        });
      },
      onMedia: (key, source, label, url) => {
        let id = tryStreamIds.current[key];
        if (!id) {
          id = `t-${key}-${Date.now()}`;
          tryStreamIds.current[key] = id;
        }
        setTryMessages((cur) => {
          const index = cur.findIndex((m) => m.id === id);
          if (index < 0) {
            return [...cur, { id, role: "copilot", text: "", media: [url], source, label: label || leadLabel }];
          }
          return cur.map((m) => m.id === id
            ? { ...m, media: [...new Set([...(m.media || []), url])] }
            : m);
        });
      },
      onTool: (_key, _source, label, name) => {
        setTryToolStatus(label ? `${label} · ${name}` : name);
      },
      onEnd: (key) => {
        delete tryStreamIds.current[key];
      },
      onIdle: () => {
        tryStreamIds.current = {};
        setTryBusy(false);
        setTryToolStatus(null);
        setTryMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text && !m.media?.length)));
      },
      onError: (message) => {
        setTryBusy(false);
        setTryToolStatus(null);
        setTryConnectError(message);
        tryStreamIds.current = {};
        setTryMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text && !m.media?.length)));
        toast.error(message);
      },
    });
    tryWsRef.current = client;
    client.connect();
    return () => {
      client.close();
      tryWsRef.current = null;
    };
  }, [draftId, userId, testMode, canTry]);

  const onSend = useCallback((text: string) => {
    const client = wsRef.current;
    if (!client) {
      toast.error(t("dev.studio.chat.not-connected"));
      return;
    }
    setMessages((cur) => [...cur, { id: `u-${Date.now()}`, role: "user", text }]);
    setBusy(true);
    streamingIdRef.current = null;
    client.sendPrompt(text);
  }, [toast, t]);

  const onCancel = useCallback(() => {
    if (testMode) {
      tryWsRef.current?.cancel();
      setTryBusy(false);
      setTryToolStatus(null);
      return;
    }
    wsRef.current?.cancel();
  }, [testMode]);

  const onTrySend = useCallback((text: string) => {
    const client = tryWsRef.current;
    if (!client || !client.ready) {
      toast.error(t("dev.studio.chat.not-connected"));
      return;
    }
    setTryMessages((cur) => [...cur, { id: `tu-${Date.now()}`, role: "user", text }]);
    setTryBusy(true);
    setTryToolStatus(null);
    client.sendPrompt(text);
  }, [toast, t]);

  const onSendToRecruiter = useCallback((snippet: string) => {
    const prompt = t("dev.studio.chat.fix-prompt", {
      text: snippet.trim().slice(0, 1200),
    });
    setComposeSeed(prompt);
    const next = new URLSearchParams(searchParams);
    next.set("mode", "develop");
    next.delete("panel");
    setSearchParams(next);
    setView("develop");
  }, [t, searchParams, setSearchParams]);

  const startRename = useCallback(() => {
    if (!draft) return;
    setRenameVal(draft.name);
    // Keep the existing English name when only the display name is edited.
    const fromId = draft.id.replace(/^dept-(?:3rd-)?/i, "");
    const prefill = /^untitled(?:-\d+)?$/i.test(fromId) ? "" : fromId;
    setRenameSlug(prefill);
    setRenameError("");
    setRenaming(true);
  }, [draft]);

  useEffect(() => {
    const dialog = renameDialogRef.current;
    if (!dialog) return;
    if (renaming) {
      if (!dialog.open) dialog.showModal();
      renameNameRef.current?.focus();
      renameNameRef.current?.select();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [renaming]);

  const onRename = useCallback(async () => {
    if (renameSaving || !draftId) return;
    const name = renameVal.trim();
    if (!name) {
      setRenameError(t("dev.studio.rename-name-required"));
      return;
    }
    const slug = sanitizeDeptShort(renameSlug);
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(renameSlug.trim())) {
      setRenameError(t("dev.studio.rename-slug-required"));
      return;
    }
    const sameName = name === draft?.name;
    const sameSlug = slug === draftId.replace(/^dept-(?:3rd-)?/i, "");
    if (sameName && sameSlug) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    setRenameError("");
    try {
      const d = await api.patch<BuilderDraft>(`/v1/dev/depts/${draftId}`, { name, slug });
      setRenaming(false);
      toast.info(t("dev.studio.renamed"));
      if (d.id !== draftId) {
        // ascii rename also changes the draft id — rebind URL/WS to the new id
        navigate(`/dev/depts/${d.id}/studio?${searchParams.toString()}`, { replace: true });
      } else {
        setDraft(d);
      }
    } catch (e) {
      setRenameError(apiErrorMessage(e, t("dev.studio.rename-failed")));
    } finally {
      setRenameSaving(false);
    }
  }, [renameVal, renameSlug, renameSaving, draftId, draft?.name, navigate, searchParams, toast, t]);

  const pollReview = useCallback(async () => {
    if (!draftId) return;
    try {
      const res = await api.get<{ security_review: SecurityReviewInfo | null }>(
        `/v1/dev/depts/${draftId}/security_review`,
      );
      const sr = res.security_review;
      setLiveReview(sr);
      if (sr && ["passed", "failed", "error", "stale"].includes(sr.status)) {
        setReviewing(false);
        const d = await api.get<BuilderDraft>(`/v1/dev/depts/${draftId}`);
        setDraft(d);
        if (sr.status === "passed") {
          if (sr.activated === false) {
            toast.info(t("dev.studio.review.activate-failed"));
          } else {
            toast.info(t("dev.studio.review.toast-passed"));
          }
        }
      }
    } catch (e) {
      setReviewing(false);
      toast.error(apiErrorMessage(e, t("dev.studio.review.poll-failed")));
    }
  }, [draftId, toast, t]);

  useEffect(() => {
    if (!reviewing || !draftId) return;
    const id = window.setInterval(() => { void pollReview(); }, 1500);
    return () => window.clearInterval(id);
  }, [reviewing, draftId, pollReview]);

  const onSubmit = useCallback(async () => {
    if (!draftId) return;
    setSubmitting(true);
    setReviewing(true);
    setLiveReview({
      status: "queued",
      steps: [
        { key: "candidate", status: "running" },
        { key: "political", status: "pending" },
        { key: "static", status: "pending" },
        { key: "secrets", status: "pending" },
        { key: "mcp", status: "pending" },
        { key: "llm", status: "pending" },
        { key: "report", status: "pending" },
      ],
    });
    try {
      const res = await api.post<{ security_review: SecurityReviewInfo }>(
        `/v1/dev/depts/${draftId}/security_review`,
      );
      setLiveReview(res.security_review || null);
    } catch (e) {
      setReviewing(false);
      setLiveReview(null);
      toast.error(apiErrorMessage(e, t("dev.studio.review.start-failed")));
    } finally {
      setSubmitting(false);
    }
  }, [draftId, toast, t]);

  const checks = useMemo(() => (draft ? computeReadiness(draft, t) : []), [draft, t]);
  const blocked = checks.some((c) => c.status === "fail") || submitting || reviewing;
  const passes = checks.filter((c) => c.status === "pass").length;
  const scoreTotal = checks.filter((c) => c.status !== "info").length;

  const cellFailed = cellStatus === "unavailable" || cellStatus === "error" || cellStatus === "frozen";

  if (!draft) {
    return <section className="container py-10"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  }

  const englishName = draft.id.replace(/^dept-(?:3rd-)?/i, "");
  const unnamed = /^untitled(?:-\d+)?$/i.test(englishName);
  const cellDetail = cellStatus === "running"
    ? t("dev.studio.cell.running")
    : cellFailed
      ? t("dev.studio.cell.failed", { error: cellError || cellStatus })
      : cellStatus === "provisioning" || cellStatus === "starting"
        ? t("dev.studio.cell.provisioning")
        : t("dev.studio.cell.status", { status: cellStatus || "unknown" });

  return (
    // 固定高度（非 min-h）：让左右两栏各自内部滚动，页面本身不滚 —— 否则
    // 聊天一长整页跟着滚，右侧预览也会被带着动。
    <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      <header data-studio-toolbar className="flex h-12 shrink-0 items-center gap-2 border-b border-border-solid bg-surface px-3 sm:gap-3 sm:px-4">
        <Link to="/dev/home" title={t("dev.studio.back")} aria-label={t("dev.studio.back")} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1 text-xs text-muted hover:bg-surface-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden />
          <span className="hidden xl:inline">{t("dev.studio.back-label")}</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0">
            <button type="button" onClick={startRename} title={t("dev.studio.rename")} aria-label={t("dev.studio.rename")}
              className="group flex max-w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-start hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span className="shrink-0 text-lg" aria-hidden>{draft.emoji}</span>
              <span className="hidden shrink-0 text-[10px] text-muted sm:inline">{t("dev.studio.name-display")}</span>
              <span title={draft.name} className="max-w-[8rem] truncate font-display text-base text-heading group-hover:text-primary xl:max-w-[16rem]">{draft.name}</span>
              <span className="h-3.5 shrink-0 border-s border-border-solid" aria-hidden />
              <span className="shrink-0 text-[10px] text-muted">{t("dev.studio.name-english")}</span>
              <span dir="ltr" title={unnamed ? t("dev.studio.name-unset") : englishName} className="max-w-[7rem] truncate font-mono text-xs text-body xl:max-w-[13rem]">{unnamed ? t("dev.studio.name-unset") : englishName}</span>
              <Pencil size={12} className="shrink-0 text-muted group-hover:text-primary" aria-hidden />
            </button>
          </h1>
          <span className={`hidden shrink-0 rounded-full border border-border-solid px-2 py-0.5 text-[11px] lg:inline-flex ${DRAFT_STATE_COLOR[draft.state] ?? "text-muted"}`}>
            {t(`dev.dept.state.${draft.state}`, { defaultValue: draft.state })}
          </span>
          {cellStatus && (
            <span title={cellDetail} className={`hidden shrink-0 items-center gap-1.5 text-[11px] xl:inline-flex ${cellFailed ? "text-spark-flare" : "text-muted"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cellFailed ? "bg-spark-flare" : cellReady ? "bg-spark-mint" : "bg-spark-blue animate-pulse"}`} aria-hidden />
              {t(cellFailed ? "dev.studio.header.cell-failed" : cellReady ? "dev.studio.header.cell-ready" : "dev.studio.header.cell-starting")}
            </span>
          )}
        </div>

        <nav className="flex shrink-0 items-center gap-1 rounded-lg bg-bg/60 p-1" aria-label={t("dev.studio.test.mode-nav")}>
          {(["develop", "test"] as const).map((mode) => (
            <button key={mode} type="button" aria-current={(mode === "test") === testMode ? "page" : undefined}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("mode", mode);
                setSearchParams(next);
                setView("develop");
              }}
              className={`min-h-8 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:px-3 ${
                (mode === "test") === testMode ? "bg-primary/10 text-primary ring-1 ring-primary/25" : "text-muted hover:bg-surface-2 hover:text-heading"
              }`}>
              {t(mode === "test" ? "dev.studio.chat.mode-try" : "dev.studio.chat.mode-recruiter")}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {view === "publish" ? (
            <button
              type="button"
              onClick={() => setView("develop")}
              className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary hover:text-primary"
            >
              {t("dev.studio.publish.back")}
            </button>
          ) : testMode ? (
            <span className="hidden items-center rounded-md border border-spark-blue/30 bg-spark-blue/5 px-2 py-1 text-[11px] text-spark-blue 2xl:inline-flex">
              {t("dev.studio.test.sandbox")}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView("publish")}
                title={t("dev.studio.readiness.title")}
                className={`rounded-full px-2.5 py-1 text-[11px] border ${
                  blocked ? "border-spark-flare/40 text-spark-flare" : "border-spark-mint/40 text-spark-mint"
                }`}
              >
                {t("dev.studio.readiness.title")} {passes}/{scoreTotal}
              </button>
            </>
          )}
        </div>
      </header>

      <dialog ref={renameDialogRef} aria-labelledby="studio-rename-title" aria-describedby="studio-rename-hint"
        onCancel={(event) => { if (renameSaving) event.preventDefault(); else setRenaming(false); }}
        onClose={() => setRenaming(false)}
        className="m-auto w-[calc(100vw_-_2rem)] max-w-sm rounded-xl border border-border-solid bg-surface p-5 text-body shadow-2xl backdrop:bg-black/60">
        <form noValidate onSubmit={(event) => { event.preventDefault(); void onRename(); }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 id="studio-rename-title" className="font-display text-lg text-heading">{t("dev.studio.rename-title")}</h2>
            <button type="button" disabled={renameSaving} onClick={() => setRenaming(false)} aria-label={t("common.cancel")}
              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-heading disabled:opacity-50"><X size={18} /></button>
          </div>
          <fieldset disabled={renameSaving} className="space-y-4">
            <label className="block text-sm">{t("dev.studio.name-display")}
              <input ref={renameNameRef} autoFocus required value={renameVal}
                onChange={(event) => { setRenameVal(event.target.value); setRenameError(""); }}
                className="mt-1.5 w-full rounded-md border border-border-solid bg-bg px-3 py-2 text-heading outline-none focus:border-primary" />
            </label>
            <label className="block text-sm">{t("dev.studio.name-english")}
              <input required dir="ltr" value={renameSlug} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="baowen"
                onChange={(event) => { setRenameSlug(event.target.value); setRenameError(""); }}
                aria-describedby="studio-rename-hint"
                className="mt-1.5 w-full rounded-md border border-border-solid bg-bg px-3 py-2 font-mono text-heading outline-none focus:border-primary" />
            </label>
          </fieldset>
          <p id="studio-rename-hint" className="mt-2 text-xs leading-relaxed text-muted">{t("dev.studio.rename-hint")}</p>
          {renameError && <p role="alert" className="mt-3 text-sm text-fusion">{renameError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={renameSaving} onClick={() => setRenaming(false)}
              className="min-h-9 rounded-md border border-border-solid px-3 text-sm hover:bg-surface-2 disabled:opacity-50">{t("common.cancel")}</button>
            <button type="submit" disabled={renameSaving || !renameVal.trim() || !renameSlug.trim()}
              className="min-h-9 rounded-md bg-primary px-4 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50">{t(renameSaving ? "dev.studio.rename-saving" : "dev.studio.rename-save")}</button>
          </div>
        </form>
      </dialog>

      {(reviewing || (liveReview && ["failed", "error", "stale", "passed"].includes(liveReview.status))) && (
        <SecurityReviewOverlay
          review={liveReview || draft.security_review || null}
          onRetry={() => { void onSubmit(); }}
          onBack={() => {
            const sr = liveReview || draft.security_review || null;
            const { notice, prompt } = buildReviewRemediation(sr, t);
            setLiveReview(null);
            setView("develop");
            const next = new URLSearchParams(searchParams);
            next.set("mode", "develop");
            setSearchParams(next);
            if (notice) {
              setMessages((cur) => [
                ...cur,
                { id: `sr-fail-${Date.now()}`, role: "copilot", text: notice },
              ]);
            }
            if (prompt) setComposeSeed(prompt);
          }}
          onDone={() => { setLiveReview(null); }}
        />
      )}

      {view === "publish" ? (
        <PublishPage
          draft={draft}
          checks={checks}
          passes={passes}
          scoreTotal={scoreTotal}
          blocked={blocked}
          submitting={submitting || reviewing}
          onSubmit={onSubmit}
        />
      ) : (
        <>
        {/* 开发：源码、画布、开发对话。切模式时保留开发输入。 */}
        <div className={testMode ? "hidden" : "flex-1 flex min-h-0"}>
          <FilesPanel draft={draft} width={filesWidth} />
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onFilesResizeStart}
            className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors -ms-1.5 relative z-10"
            title={t("dev.studio.chat.resize", { defaultValue: "拖动调整宽度" })}
          />
          <PreviewPane draft={draft} />
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onChatResizeStart}
            className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors -me-1.5 relative z-10"
            title={t("dev.studio.chat.resize", { defaultValue: "拖动调整宽度" })}
          />
          <VibeChat
            width={chatWidth}
            mode="recruiter"
            onModeChange={() => {}}
            showModeSwitch={false}
            canTry={false}
            tryDisabledReason={t("dev.studio.chat.try-disabled")}
            deptLabel={draft ? `${draft.emoji || ""} ${draft.name}`.trim() : t("dev.studio.chat.mode-try")}
            messages={messages}
            onSend={onSend}
            onCancel={onCancel}
            busy={busy}
            toolStatus={toolStatus}
            composeSeed={composeSeed}
            onComposeSeedConsumed={() => setComposeSeed(null)}
            onSendToRecruiter={onSendToRecruiter}
          />
        </div>
        {testMode && (
          <div className="flex-1 flex min-h-0">
            <TestWorkspace
              draft={draft}
              messages={tryMessages}
              onSend={onTrySend}
              onCancel={onCancel}
              onSendToRecruiter={onSendToRecruiter}
              busy={tryBusy}
              ready={canTry && tryReady}
              connectError={canTry ? tryConnectError : t("dev.studio.chat.try-disabled")}
              toolStatus={tryToolStatus}
            />
          </div>
        )}
        </>
      )}
    </div>
  );
}

/** Build chat notice + sendable remediation prompt from a failed review. */
function buildReviewRemediation(
  review: SecurityReviewInfo | null,
  t: (k: string, o?: Record<string, string | number>) => string,
): { notice: string; prompt: string } {
  if (!review) {
    return {
      notice: t("dev.studio.review.remediate-notice-empty"),
      prompt: t("dev.studio.review.remediate-prompt-empty"),
    };
  }
  const findings = review.findings || [];
  const lines = findings.length
    ? findings.map((f, i) => {
        const loc = [f.file, f.line].filter((x) => x != null && x !== "").join(":");
        const ev = f.evidence_redacted ? ` \`${f.evidence_redacted}\`` : "";
        return `${i + 1}. **${f.severity || "info"}** \`${f.rule || "finding"}\`${loc ? ` @ ${loc}` : ""}\n   ${f.message || ""}${ev}`;
      })
    : [t("dev.studio.review.remediate-no-findings")];

  const notice = [
    t("dev.studio.review.remediate-notice-head"),
    "",
    ...lines,
    "",
    review.report_md ? review.report_md.slice(0, 1200) : "",
    "",
    t("dev.studio.review.remediate-notice-tail"),
  ].filter((x, i, arr) => !(x === "" && arr[i - 1] === "")).join("\n").trim();

  const bulletPlain = findings.length
    ? findings.map((f, i) => {
        const loc = [f.file, f.line].filter((x) => x != null && x !== "").join(":");
        return `${i + 1}. [${f.severity || "info"}] ${f.rule || "finding"}${loc ? ` @ ${loc}` : ""} — ${f.message || ""}`;
      }).join("\n")
    : t("dev.studio.review.remediate-no-findings");

  const prompt = [
    t("dev.studio.review.remediate-prompt-head"),
    "",
    bulletPlain,
    "",
    t("dev.studio.review.remediate-prompt-tail"),
  ].join("\n");

  return { notice, prompt };
}

function PublishPage({
  draft, checks, passes, scoreTotal, blocked, submitting, onSubmit,
}: {
  draft: BuilderDraft;
  checks: Check[];
  passes: number;
  scoreTotal: number;
  blocked: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const sr = draft.security_review;
  const needsReview = !sr || sr.status === "stale" || sr.status === "failed" || sr.status === "error";
  const publishedClean = draft.state === "published" && sr?.status === "passed";
  // Readiness fails still block; review badge warn does not (danger is warn until reviewed).
  const readinessBlocked = checks.some((c) => c.status === "fail" && c.key !== "danger");
  const btnLabel = needsReview && sr
    ? t("dev.studio.action.resubmit-review")
    : t("dev.studio.action.submit");
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-heading">
              {t("dev.studio.readiness.title")}
            </h2>
            <p className="text-sm text-muted mt-1">
              {t("dev.studio.publish.hint")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {needsReview && (
              <span className="rounded-full px-3 py-1 text-xs border border-spark-flare/40 text-spark-flare">
                {t("dev.studio.review.badge-needed")}
              </span>
            )}
            <div className={`rounded-full px-3 py-1 text-sm border ${
              readinessBlocked ? "border-spark-flare/40 text-spark-flare" : "border-spark-mint/40 text-spark-mint"
            }`}>
              {passes}/{scoreTotal}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {checks.map((c) => {
            const m = STATUS_META[c.status];
            return (
              <div key={c.key} className="flex items-start gap-2.5 rounded-md border border-border-solid bg-surface px-4 py-3">
                <span className={`shrink-0 text-sm leading-5 ${m.color}`} aria-hidden>{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-body">{c.label}</div>
                  {c.detail && <div className="text-[11px] text-muted mt-0.5">{c.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {publishedClean && (
          <div className="rounded-md border border-spark-mint/30 bg-spark-mint/5 px-4 py-3 text-sm space-y-1">
            <div className="text-spark-mint">
              {t("dev.studio.review.badge-passed", { policy: sr?.policy_version || "1" })}
            </div>
            <div className="text-xs text-muted">
              {sr?.listed
                ? t("dev.studio.review.listed")
                : t("dev.studio.review.pending-review")}
              {" · "}
              {sr?.activated === false
                ? t("dev.studio.review.activate-failed")
                : t("dev.studio.review.activated")}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={readinessBlocked || submitting || (publishedClean && !needsReview)}
            title={readinessBlocked ? t("dev.studio.action.submit-blocked") : undefined}
            onClick={onSubmit}
            className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "…" : btnLabel}
          </button>
          {readinessBlocked && (
            <span className="text-xs text-spark-flare">{t("dev.studio.action.submit-blocked")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
