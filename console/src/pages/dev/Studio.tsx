/**
 * /dev/depts/:deptId/studio — For Builders Studio (Recruiter WS).
 *
 * Two-pane: Recruiter chat (claude-agent-sdk via /v1/dev/recruiter/ws) on the
 * start side; live preview on the end side driven by draft_update.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api, apiErrorMessage, type Me } from "../../lib/api";
import type { BuilderDraft, DraftAgent, DraftFile, ChatMsg } from "../../lib/builderFixtures";
import { estCostPerTask } from "../../lib/builderFixtures";
import { RecruiterWs } from "../../lib/recruiterWs";
import { AgentNode, type AgentNodeData } from "../../components/canvas/AgentNode";
import { useToast } from "../../components/ui/Toast";
import { EmptyState } from "../../components/ui/EmptyState";
import { Markdown } from "../../components/ui/Markdown";

const NODE_TYPES = { agent: AgentNode };

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
  in_review: "text-spark-blue",
  published: "text-spark-mint",
  publishing: "text-spark-blue",
  publish_failed: "text-fusion",
};

// ── canvas construction: 部长 → 子 Agent 工作流阶段图 ────────────────────────
// 对应 AGENTS.md 的架构图：部长（Orchestrator，只编排不执行）在顶部，
// workflow.steps 按序竖排成流水线（带门禁标注）；不在流水线里的子 Agent
// 挂在右侧一列（虚线 = 部长按需 spawn）。无 workflow 时退化为扇出布局。
const NODE_W = 224;   // AgentNode w-56
const COL_GAP = 96;
const ROW_H = 168;
const LEAD_POS = { x: 0, y: 0 };
const STEP_Y0 = 200;

function buildCanvas(draft: BuilderDraft, leadNote: string): { nodes: Node[]; edges: Edge[] } {
  const lead: DraftAgent = draft.agents.find((a) => a.team_role === "orchestrator")
    ?? { slug: "lead", display_name: `${draft.name} Lead`, team_role: "orchestrator", tier: "HIGH" };
  const subs = draft.agents.filter((a) => a.team_role !== "orchestrator");
  const bySlug = new Map(subs.map((a) => [a.slug, a]));
  const byName = new Map(subs.map((a) => [a.display_name, a]));
  const steps = draft.workflow?.steps ?? [];

  const nodes: Node[] = [
    {
      id: "lead", type: "agent", position: LEAD_POS, draggable: true,
      data: { agent: lead, isLead: true, emoji: draft.emoji, leadNote } as AgentNodeData,
    },
  ];
  const edges: Edge[] = [];
  const inPipeline = new Set<string>();

  steps.forEach((step, i) => {
    const agent: DraftAgent =
      (step.slug && bySlug.get(step.slug))
      || byName.get(step.agent)
      || { slug: step.slug || `step-${i}`, display_name: step.agent, team_role: "builder", tier: "MEDIUM" };
    inPipeline.add(agent.slug);
    const id = `step-${i}`;
    nodes.push({
      id, type: "agent", draggable: true,
      position: { x: 0, y: STEP_Y0 + i * ROW_H },
      data: {
        agent, stepIndex: i + 1,
        action: step.action, output: step.output, gate: step.gate,
      } as AgentNodeData,
    });
    if (i === 0) {
      edges.push({
        id: `e-lead-${id}`, source: "lead", target: id, type: "smoothstep", animated: true,
        style: { stroke: "rgba(212,168,78,0.7)" },
      });
    } else {
      edges.push({
        id: `e-${i - 1}-${i}`, source: `step-${i - 1}`, target: id, type: "smoothstep", animated: true,
        style: { stroke: "rgba(212,168,78,0.7)" },
        label: step.gate ? `🚧 ${step.gate}` : undefined,
        labelStyle: { fill: "var(--color-spark-flare, #e8a44a)", fontSize: 10 },
        labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
        labelBgPadding: [4, 2] as [number, number],
      });
    }
  });

  // 不在流水线里的子 Agent（按需 spawn）：有流水线时挂右侧一列，
  // 没有流水线时双列扇出在部长下方。
  const rest = subs.filter((a) => !inPipeline.has(a.slug));
  rest.forEach((a, i) => {
    const id = `sub-${a.slug}`;
    const position = steps.length
      ? { x: NODE_W + COL_GAP, y: STEP_Y0 + i * ROW_H }
      : {
          x: (i % 2) * (NODE_W + 48) - (rest.length > 1 ? (NODE_W + 48) / 2 : 0),
          y: STEP_Y0 - 20 + Math.floor(i / 2) * ROW_H,
        };
    nodes.push({
      id, type: "agent", draggable: true, position,
      data: { agent: a } as AgentNodeData,
    });
    edges.push({
      id: `e-lead-${id}`, source: "lead", target: id, type: "smoothstep",
      style: { stroke: "rgba(212,168,78,0.35)", strokeDasharray: "5 4" },
    });
  });

  return { nodes, edges };
}

function computeReadiness(draft: BuilderDraft, t: (k: string) => string): Check[] {
  const hasOrch = draft.agents.some((a) => a.team_role === "orchestrator");
  const cost = estCostPerTask(draft.agents);
  return [
    { key: "soul", label: t("dev.studio.readiness.soul"), status: "pass" },
    { key: "orch", label: t("dev.studio.readiness.orchestrator"), status: hasOrch ? "pass" : "fail" },
    { key: "mcp", label: t("dev.studio.readiness.mcp"), status: draft.skills.length ? "warn" : "pass", detail: draft.skills.length ? t("dev.studio.readiness.mcp-warn") : undefined },
    { key: "danger", label: t("dev.studio.readiness.danger"), status: "pass" },
    { key: "cost", label: t("dev.studio.readiness.cost"), status: "info", detail: `¥${cost.toFixed(2)}` },
  ];
}

const CHAT_WIDTH_KEY = "dev.studio.chat-width";
const CHAT_MIN_W = 280;
const CHAT_MAX_W = 720;

export default function DevStudio() {
  const { deptId } = useParams<{ deptId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tab, setTab] = useState<string>("__canvas");
  const [userId, setUserId] = useState("user-dev-0001");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const wsRef = useRef<RecruiterWs | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const [chatWidth, setChatWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= CHAT_MIN_W && saved <= CHAT_MAX_W ? saved : 420;
  });

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatWidth;
    // In RTL layouts the chat pane sits on the right, so dragging left widens it.
    const dir = getComputedStyle(document.documentElement).direction === "rtl" ? -1 : 1;
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, startW + dir * (ev.clientX - startX)));
      setChatWidth(w);
    };
    const onUp = (ev: PointerEvent) => {
      const w = Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, startW + dir * (ev.clientX - startX)));
      localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(w)));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [chatWidth]);

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

  // 新建部门 — allocate a fresh draft server-side, then swap the URL to its id
  // so every "new" opens a clean draft instead of the stale dept-untitled.
  useEffect(() => {
    if (deptId !== "new" || creatingRef.current) return;
    creatingRef.current = true;
    api
      .post<BuilderDraft>(`/v1/dev/depts?user_id=${encodeURIComponent(userId)}`)
      .then((d) => navigate(`/dev/depts/${d.id}/studio`, { replace: true }))
      .catch((e) => {
        creatingRef.current = false;
        toast.error(apiErrorMessage(e, t("dev.studio.load-error")));
      });
  }, [deptId, userId, navigate, toast, t]);

  // Reset view state when the bound draft changes (e.g. new-draft redirect).
  useEffect(() => {
    setDraft(null);
    setMessages([]);
  }, [draftId]);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    api
      .get<BuilderDraft>(`/v1/dev/depts/${draftId}?user_id=${encodeURIComponent(userId)}`)
      .then((d) => { if (!cancelled) { setDraft(d); } })
      .catch((e) => toast.error(apiErrorMessage(e, t("dev.studio.load-error"))));
    return () => { cancelled = true; };
  }, [draftId, userId, toast, t]);

  useEffect(() => {
    if (!draftId || !userId) return;
    const client = new RecruiterWs(userId, draftId, {
      onUserText: (text) => {
        setMessages((cur) => [...cur, { id: `hu-${cur.length}`, role: "user", text }]);
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
        setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, text: m.text + text } : m)));
      },
      onToolUse: (name) => {
        setToolStatus(name.replace(/^mcp__recruiter__/, ""));
      },
      onDraftUpdate: (d) => {
        if (d && typeof d === "object") {
          setDraft(d as BuilderDraft);
          setToolStatus(null);
        }
      },
      onDone: () => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
      },
      onError: (message) => {
        setBusy(false);
        toast.error(message);
      },
    });
    wsRef.current = client;
    client.connect(true);
    return () => {
      client.close();
      wsRef.current = null;
    };
  }, [draftId, userId, toast]);

  const onSend = useCallback((text: string) => {
    setMessages((cur) => [...cur, { id: `u-${Date.now()}`, role: "user", text }]);
    setBusy(true);
    streamingIdRef.current = null;
    wsRef.current?.sendPrompt(text);
  }, []);

  const onCancel = useCallback(() => {
    wsRef.current?.cancel();
  }, []);

  const startRename = useCallback(() => {
    if (!draft) return;
    setRenameVal(draft.name);
    setRenaming(true);
  }, [draft]);

  const onRename = useCallback(async () => {
    const name = renameVal.trim();
    setRenaming(false);
    if (!name || !draftId || name === draft?.name) return;
    try {
      const d = await api.patch<BuilderDraft>(
        `/v1/dev/depts/${draftId}?user_id=${encodeURIComponent(userId)}`,
        { name },
      );
      toast.info(t("dev.studio.renamed"));
      if (d.id !== draftId) {
        // ascii rename also changes the draft id — rebind URL/WS to the new id
        navigate(`/dev/depts/${d.id}/studio`, { replace: true });
      } else {
        setDraft(d);
      }
    } catch (e) {
      toast.error(apiErrorMessage(e, t("dev.studio.rename-failed")));
    }
  }, [renameVal, draftId, draft?.name, userId, navigate, toast, t]);

  const onSubmit = useCallback(async () => {
    if (!draftId) return;
    setSubmitting(true);
    try {
      await api.post(`/v1/dev/depts/${draftId}/submit?user_id=${encodeURIComponent(userId)}`);
      toast.info("已上架");
      const d = await api.get<BuilderDraft>(
        `/v1/dev/depts/${draftId}?user_id=${encodeURIComponent(userId)}`,
      );
      setDraft(d);
    } catch (e) {
      toast.error(apiErrorMessage(e, "Submit failed"));
    } finally {
      setSubmitting(false);
    }
  }, [draftId, userId, toast]);

  const checks = useMemo(() => (draft ? computeReadiness(draft, t) : []), [draft, t]);
  const blocked = checks.some((c) => c.status === "fail") || submitting;
  const passes = checks.filter((c) => c.status === "pass").length;
  const scoreTotal = checks.filter((c) => c.status !== "info").length;

  if (!draft) {
    return <section className="container py-10"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  }

  return (
    // 固定高度（非 min-h）：让左右两栏各自内部滚动，页面本身不滚 —— 否则
    // 聊天一长整页跟着滚，右侧预览也会被带着动。
    <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      <header className="border-b border-border-solid bg-surface px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dev/home" className="text-xs text-muted hover:text-primary shrink-0">{t("dev.studio.back")}</Link>
          <span className="text-2xl shrink-0">{draft.emoji}</span>
          <div className="min-w-0">
            {renaming ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={onRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="font-display text-lg text-heading bg-surface border border-primary rounded px-2 py-0.5 outline-none w-56"
              />
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h1
                  className="font-display text-lg text-heading truncate cursor-pointer hover:text-primary"
                  title={t("dev.studio.rename")}
                  onClick={startRename}
                >
                  {draft.name}
                </h1>
                <button
                  type="button"
                  onClick={startRename}
                  title={t("dev.studio.rename")}
                  aria-label={t("dev.studio.rename")}
                  className="text-xs text-muted hover:text-primary shrink-0"
                >
                  ✏️
                </button>
              </div>
            )}
            <span className={`text-[11px] ${DRAFT_STATE_COLOR[draft.state] ?? "text-muted"}`}>
              {t(`dev.dept.state.${draft.state}`, { defaultValue: draft.state })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("__readiness")}
            title={t("dev.studio.readiness.title")}
            className={`rounded-full px-2.5 py-1 text-[11px] border ${
              blocked ? "border-spark-flare/40 text-spark-flare" : "border-spark-mint/40 text-spark-mint"
            }`}
          >
            {t("dev.studio.readiness.title")} {passes}/{scoreTotal}
          </button>
          <button
            type="button"
            onClick={() => toast.info(t("dev.studio.action.stub"))}
            className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary hover:text-primary"
          >
            {t("dev.studio.action.fork")}
          </button>
          <button
            type="button"
            disabled
            title={t("dev.studio.action.testdrive-soon")}
            className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-muted opacity-50 cursor-not-allowed"
          >
            {t("dev.studio.action.testdrive")}
          </button>
          <button
            type="button"
            disabled={blocked || draft.state === "published"}
            title={blocked ? t("dev.studio.action.submit-blocked") : undefined}
            onClick={onSubmit}
            className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "…" : t("dev.studio.action.submit")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <VibeChat
          width={chatWidth}
          messages={messages}
          onSend={onSend}
          onCancel={onCancel}
          busy={busy}
          toolStatus={toolStatus}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors -ms-1.5 relative z-10"
          title={t("dev.studio.chat.resize", { defaultValue: "拖动调整宽度" })}
        />
        <PreviewPane draft={draft} checks={checks} tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

// ── left: vibe chat ─────────────────────────────────────────────────────────
function VibeChat({
  width, messages, onSend, onCancel, busy, toolStatus,
}: {
  width: number;
  messages: ChatMsg[];
  onSend: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  toolStatus: string | null;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  // 只滚聊天容器自己 —— scrollIntoView 会把所有可滚祖先（包括页面）一起滚，
  // 右侧预览会被带着动。
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.text]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    onSend(text);
    setInput("");
  };

  return (
    <aside
      style={{ width }}
      className="shrink-0 border-e border-border-solid flex flex-col min-h-0 bg-surface/40"
    >
      <div className="px-4 py-2.5 border-b border-border-solid text-xs uppercase tracking-widest text-muted shrink-0">
        💬 {t("dev.studio.chat.title")}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
              m.role === "user"
                ? "bg-surface-2 text-body whitespace-pre-wrap"
                : "bg-surface border border-border-solid text-body"
            }`}>
              {m.role === "copilot" ? (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-primary mb-1">Recruiter</div>
                  {m.text ? <Markdown text={m.text} /> : (busy ? "…" : "")}
                </>
              ) : (
                m.text || (busy ? "…" : "")
              )}
            </div>
          </div>
        ))}
        {toolStatus && (
          <div className="text-[11px] text-muted px-1">⏳ {toolStatus}…</div>
        )}
      </div>
      <div className="border-t border-border-solid p-3 shrink-0">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("dev.studio.chat.placeholder")}
            disabled={busy}
            className="flex-1 bg-surface border border-border-solid rounded px-3 py-1.5 text-sm text-body placeholder:text-dim focus:border-primary outline-none disabled:opacity-60"
          />
          {busy ? (
            <button type="button" onClick={onCancel} className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-fusion hover:text-fusion">
              Cancel
            </button>
          ) : (
            <button type="submit" className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition">
              {t("dev.studio.chat.send")}
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}

// ── right: preview tabs ─────────────────────────────────────────────────────
function PreviewPane({ draft, checks, tab, setTab }: { draft: BuilderDraft; checks: Check[]; tab: string; setTab: (t: string) => void }) {
  const { t } = useTranslation();
  // skills 不再单独开 tab —— skills/<name>/SKILL.md 已归入文件树的 Skills 分组，
  // 两处并存反而重复。旧状态兼容：文件名 / "__skills" 都归到文件页。
  const tabs: { key: string; label: string }[] = [
    { key: "__canvas", label: t("dev.studio.tab.canvas") },
    { key: "__files", label: t("dev.studio.tab.files", { defaultValue: "文件" }) },
    { key: "__readiness", label: t("dev.studio.tab.readiness") },
  ];
  const isFileTab = !tab.startsWith("__") || tab === "__skills";

  return (
    <main className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="border-b border-border-solid px-4 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === tb.key || (tb.key === "__files" && isFileTab)
                ? "border-primary text-primary" : "border-transparent text-body hover:text-primary"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "__canvas" && <DraftCanvas draft={draft} />}
        {(tab === "__files" || isFileTab) && (
          <FilesExplorer draft={draft} initialFile={!tab.startsWith("__") ? tab : undefined} />
        )}
        {tab === "__readiness" && <Readiness checks={checks} />}
      </div>
    </main>
  );
}

function DraftCanvas({ draft }: { draft: BuilderDraft }) {
  const { t } = useTranslation();
  const leadNote = t("dev.studio.canvas.lead-note", { defaultValue: "只编排，不亲自干活" });
  const { nodes, edges } = useMemo(() => buildCanvas(draft, leadNote), [draft, leadNote]);
  const hasWorkflow = (draft.workflow?.steps?.length ?? 0) > 0;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 text-[11px] shrink-0 flex items-center gap-2 flex-wrap">
        <span className="text-muted">{t("dev.studio.canvas.hint")}</span>
        {hasWorkflow ? (
          draft.workflow?.description && (
            <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5">
              ⛓ {draft.workflow.description}
            </span>
          )
        ) : (
          <span className="text-spark-flare">
            {t("dev.studio.canvas.no-workflow", { defaultValue: "还没有工作流——让 Recruiter 帮你设计子 Agent 流水线" })}
          </span>
        )}
      </div>
      <div className="flex-1 relative bg-bg min-h-0">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(212, 168, 78, 0.15)" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

// ── files explorer: 主 Agent / 子 Agent / Skills 分组文件树 ──────────────────
interface FileGroup { key: string; label: string; icon: string; files: DraftFile[] }

function groupDraftFiles(draft: BuilderDraft, leadFallback: string): FileGroup[] {
  const nameBySlug = new Map(draft.agents.map((a) => [a.slug, a.display_name]));
  const lead: DraftFile[] = [];
  const byAgent = new Map<string, DraftFile[]>();
  const skills: DraftFile[] = [];
  for (const f of draft.files) {
    if (f.name.startsWith("agents/")) {
      const slug = f.name.split("/")[1] ?? "";
      if (!byAgent.has(slug)) byAgent.set(slug, []);
      byAgent.get(slug)!.push(f);
    } else if (f.name.startsWith("skills/")) {
      skills.push(f);
    } else {
      lead.push(f);
    }
  }
  const leadAgent = draft.agents.find((a) => a.team_role === "orchestrator");
  const groups: FileGroup[] = [{
    key: "__lead",
    label: leadAgent?.display_name || leadFallback,
    icon: draft.emoji || "👑",
    files: lead,
  }];
  for (const [slug, files] of [...byAgent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ key: slug, label: nameBySlug.get(slug) || slug, icon: "🤖", files });
  }
  if (skills.length) {
    groups.push({ key: "__skills", label: "Skills", icon: "🧩", files: skills });
  }
  return groups.filter((g) => g.files.length > 0);
}

function FilesExplorer({ draft, initialFile }: { draft: BuilderDraft; initialFile?: string }) {
  const { t } = useTranslation();
  const leadFallback = t("dev.studio.files.lead", { defaultValue: "部长（主 Agent）" });
  const groups = useMemo(() => groupDraftFiles(draft, leadFallback), [draft, leadFallback]);
  const [selected, setSelected] = useState<string | null>(initialFile ?? null);
  const file =
    draft.files.find((f) => f.name === selected)
    ?? draft.files.find((f) => f.name === "AGENTS.md")
    ?? draft.files[0];

  if (!file) {
    return <div className="p-6"><EmptyState icon="📄" title={t("dev.studio.files.empty", { defaultValue: "还没有文件——先和 Recruiter 聊出一版草稿" })} /></div>;
  }

  const baseName = (n: string) => n.split("/").pop() ?? n;

  return (
    <div className="h-full flex min-h-0">
      <aside className="w-56 shrink-0 border-e border-border-solid overflow-y-auto py-2">
        {groups.map((g) => (
          <div key={g.key} className="mb-1.5">
            <div className="px-3 py-1 flex items-center gap-1.5 text-[11px] text-muted uppercase tracking-wider truncate" title={g.label}>
              <span>{g.icon}</span>
              <span className="truncate">{g.label}</span>
              <span className="text-dim">{g.files.length}</span>
            </div>
            {g.files.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => setSelected(f.name)}
                title={f.name}
                className={`w-full text-start ps-7 pe-3 py-1 text-xs font-mono truncate transition-colors ${
                  f.name === file.name
                    ? "text-primary bg-primary/10 border-e-2 border-primary"
                    : "text-body hover:text-primary hover:bg-surface"
                }`}
              >
                {g.key === "__skills" ? f.name.replace(/^skills\//, "") : baseName(f.name)}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="flex-1 min-w-0">
        <FileView file={file} />
      </div>
    </div>
  );
}

function FileView({ file }: { file: DraftFile }) {
  const { t } = useTranslation();
  const [showDiff, setShowDiff] = useState(false);
  const diffCls = (kind: string) =>
    kind === "add" ? "text-spark-mint bg-spark-mint/10"
      : kind === "del" ? "text-fusion bg-fusion/10"
        : "text-muted";
  const prefix = (kind: string) => (kind === "add" ? "+ " : kind === "del" ? "- " : "  ");

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-border-solid shrink-0">
        <span className="text-xs font-mono text-muted">{file.name}</span>
        {file.diff && (
          <button
            type="button"
            onClick={() => setShowDiff((d) => !d)}
            className="text-[11px] text-primary hover:underline"
          >
            {showDiff ? t("dev.studio.file.diff-off") : t("dev.studio.file.diff-on")}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {showDiff && file.diff ? (
          <pre className="font-mono text-xs leading-relaxed">
            {file.diff.map((l, i) => (
              <div key={i} className={`px-1 ${diffCls(l.kind)}`}>{prefix(l.kind)}{l.text}</div>
            ))}
          </pre>
        ) : (
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-body">{file.content}</pre>
        )}
      </div>
    </div>
  );
}

function Readiness({ checks }: { checks: Check[] }) {
  const { t } = useTranslation();
  return (
    <div className="p-4 max-w-xl space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-muted mb-1">{t("dev.studio.readiness.title")}</h3>
      {checks.map((c) => {
        const m = STATUS_META[c.status];
        return (
          <div key={c.key} className="flex items-start gap-2.5 rounded-md border border-border-solid bg-surface px-3 py-2">
            <span className={`shrink-0 text-sm leading-5 ${m.color}`} aria-hidden>{m.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-body">{c.label}</div>
              {c.detail && <div className="text-[11px] text-muted mt-0.5">{c.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
