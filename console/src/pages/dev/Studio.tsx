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
import type {
  BuilderDraft, DraftAgent, DraftFile, DraftWorkflowStep, ChatMsg, SecurityReviewInfo,
} from "../../lib/builderFixtures";
import { estCostPerTask } from "../../lib/builderFixtures";
import { needsDeptSlug, sanitizeDeptShort } from "../../lib/depts";
import { RecruiterWs } from "../../lib/recruiterWs";
import { AgentNode, type AgentNodeData } from "../../components/canvas/AgentNode";
import { SecurityReviewOverlay } from "../../components/SecurityReviewOverlay";
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
  ready: "text-spark-mint",
  in_review: "text-spark-blue",
  published: "text-spark-mint",
  publishing: "text-spark-blue",
  publish_failed: "text-fusion",
};

// ── canvas construction: 部长 → 子 Agent 工作流阶段图 ────────────────────────
// 对应 AGENTS.md 的架构图：部长（Orchestrator，只编排不执行）在顶部，
// workflow.steps 按序竖排成流水线（带门禁标注）；步骤带不同 lane（泳道）时
// 拆成并行分支列，上一条 lane 末步的 output（如情报库）作为衔接边连到下一条
// lane 的头。不在流水线里的子 Agent 挂最右一列（虚线 = 部长按需 spawn）。
// 无 workflow 时退化为扇出布局。
const NODE_W = 224;   // AgentNode w-56
const COL_GAP = 128;
const ROW_H = 200;
const FAN_GAP = 72;   // 无 workflow 时双列扇出的列间距
const STEP_Y0 = 240;

const GATE_LABEL_PROPS = {
  labelStyle: { fill: "var(--color-spark-flare, #e8a44a)", fontSize: 10 },
  labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
  labelBgPadding: [4, 2] as [number, number],
};

interface CanvasLane { name: string; entries: { step: DraftWorkflowStep; index: number }[] }

/** 按 step.lane 分组（保持首次出现顺序）；无 lane 的步骤归入 "" 泳道。 */
function groupLanes(steps: DraftWorkflowStep[]): CanvasLane[] {
  const lanes: CanvasLane[] = [];
  const byName = new Map<string, CanvasLane>();
  steps.forEach((step, index) => {
    const name = (step.lane ?? "").trim();
    let lane = byName.get(name);
    if (!lane) {
      lane = { name, entries: [] };
      byName.set(name, lane);
      lanes.push(lane);
    }
    lane.entries.push({ step, index });
  });
  return lanes;
}

function buildCanvas(draft: BuilderDraft, leadNote: string): { nodes: Node[]; edges: Edge[] } {
  const lead: DraftAgent = draft.agents.find((a) => a.team_role === "orchestrator")
    ?? { slug: "lead", display_name: `${draft.name} Lead`, team_role: "orchestrator", tier: "HIGH" };
  const subs = draft.agents.filter((a) => a.team_role !== "orchestrator");
  const bySlug = new Map(subs.map((a) => [a.slug, a]));
  const byName = new Map(subs.map((a) => [a.display_name, a]));
  const steps = draft.workflow?.steps ?? [];
  const lanes = groupLanes(steps);
  const multiLane = lanes.length > 1;
  const laneX = (j: number) => j * (NODE_W + COL_GAP);

  const nodes: Node[] = [
    {
      id: "lead", type: "agent", draggable: true,
      // 多泳道时部长居中横跨所有泳道列
      position: { x: multiLane ? laneX(lanes.length - 1) / 2 : 0, y: 0 },
      data: { agent: lead, isLead: true, emoji: draft.emoji, leadNote } as AgentNodeData,
    },
  ];
  const edges: Edge[] = [];
  const inPipeline = new Set<string>();

  lanes.forEach((lane, j) => {
    lane.entries.forEach(({ step, index }, k) => {
      const agent: DraftAgent =
        (step.slug && bySlug.get(step.slug))
        || byName.get(step.agent)
        || { slug: step.slug || `step-${index}`, display_name: step.agent, team_role: "builder", tier: "MEDIUM" };
      inPipeline.add(agent.slug);
      const id = `step-${index}`;
      nodes.push({
        id, type: "agent", draggable: true,
        position: { x: laneX(j), y: STEP_Y0 + k * ROW_H },
        data: {
          agent, stepIndex: index + 1,
          action: step.action, output: step.output, gate: step.gate,
          lane: multiLane ? lane.name : undefined,
        } as AgentNodeData,
      });
      if (k === 0) {
        // 泳道头：部长派发；多泳道时边上标泳道名（触发时机分组）
        edges.push({
          id: `e-lead-${id}`, source: "lead", target: id, type: "smoothstep", animated: true,
          style: { stroke: "rgba(212,168,78,0.7)" },
          label: multiLane && lane.name ? `▤ ${lane.name}` : undefined,
          labelStyle: { fill: "var(--color-primary, #d4a84e)", fontSize: 10 },
          labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
          labelBgPadding: [4, 2] as [number, number],
        });
        // 泳道衔接：上一条泳道末步有 output（如情报库）时画一条虚线交接边
        const prevLast = j > 0 ? lanes[j - 1].entries[lanes[j - 1].entries.length - 1] : null;
        const handoff = (prevLast?.step.output ?? "").trim();
        if (prevLast && handoff) {
          edges.push({
            id: `e-handoff-${prevLast.index}-${index}`,
            source: `step-${prevLast.index}`, target: id, type: "smoothstep",
            style: { stroke: "rgba(96,211,168,0.6)", strokeDasharray: "6 4" },
            label: `📦 ${handoff}`,
            labelStyle: { fill: "var(--color-spark-mint, #60d3a8)", fontSize: 10 },
            labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
            labelBgPadding: [4, 2] as [number, number],
          });
        }
      } else {
        const prevIndex = lane.entries[k - 1].index;
        edges.push({
          id: `e-${prevIndex}-${index}`, source: `step-${prevIndex}`, target: id,
          type: "smoothstep", animated: true,
          style: { stroke: "rgba(212,168,78,0.7)" },
          label: step.gate ? `🚧 ${step.gate}` : undefined,
          ...GATE_LABEL_PROPS,
        });
      }
    });
  });

  // 不在流水线里的子 Agent（按需 spawn）：有流水线时挂最右一列，
  // 没有流水线时双列扇出在部长下方。
  const rest = subs.filter((a) => !inPipeline.has(a.slug));
  rest.forEach((a, i) => {
    const id = `sub-${a.slug}`;
    const position = steps.length
      ? { x: laneX(lanes.length), y: STEP_Y0 + i * ROW_H }
      : {
          x: (i % 2) * (NODE_W + FAN_GAP) - (rest.length > 1 ? (NODE_W + FAN_GAP) / 2 : 0),
          y: STEP_Y0 + Math.floor(i / 2) * ROW_H,
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

function loadPaneWidth(key: string, min: number, max: number, fallback: number): number {
  const saved = Number(localStorage.getItem(key));
  return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback;
}

// side: 该栏贴在容器的哪一侧（start = 最左栏拖右边缘，end = 最右栏拖左边缘）。
function usePaneResize(
  width: number,
  setWidth: (w: number) => void,
  opts: { key: string; min: number; max: number; side: "start" | "end" },
) {
  const { key, min, max, side } = opts;
  return useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    // start 栏向中间（物理右/RTL 物理左）拖变宽；end 栏相反。
    const dir = (side === "start" ? 1 : -1) * (rtl ? -1 : 1);
    const clamp = (ev: PointerEvent) =>
      Math.min(max, Math.max(min, startW + dir * (ev.clientX - startX)));
    const onMove = (ev: PointerEvent) => setWidth(clamp(ev));
    const onUp = (ev: PointerEvent) => {
      localStorage.setItem(key, String(Math.round(clamp(ev))));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [width, setWidth, key, min, max, side]);
}

type ChatMode = "recruiter" | "try";

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
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tryMessages, setTryMessages] = useState<ChatMsg[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>("recruiter");
  // develop = 文件/预览/对话；publish = 整页发布（就绪度）
  const [view, setView] = useState<"develop" | "publish">("develop");
  const [userId, setUserId] = useState("user-dev-0001");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tryBusy, setTryBusy] = useState(false);
  const [trySessionId, setTrySessionId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [liveReview, setLiveReview] = useState<SecurityReviewInfo | null>(null);
  /** Prefill chat composer when returning from a failed review. */
  const [composeSeed, setComposeSeed] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [renameSlug, setRenameSlug] = useState("");
  const wsRef = useRef<RecruiterWs | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const tryAbortRef = useRef<AbortController | null>(null);
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
    setTryMessages([]);
    setTrySessionId(undefined);
    setChatMode("recruiter");
    setTryBusy(false);
    tryAbortRef.current?.abort();
    tryAbortRef.current = null;
    setView("develop");
  }, [draftId]);

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
          setDraft(d as BuilderDraft);
          setToolStatus(null);
        }
      },
      onDone: () => {
        setBusy(false);
        setToolStatus(null);
        streamingIdRef.current = null;
        // Drop empty streaming placeholders so they never linger / re-animate.
        setMessages((cur) => cur.filter((m) => !(m.role === "copilot" && !m.text)));
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
  }, [draftId, userId, toast]);

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
    if (!draftId || tryBusy) return;
    const userMsg: ChatMsg = { id: `tu-${Date.now()}`, role: "user", text };
    setTryMessages((cur) => [...cur, userMsg]);
    setTryBusy(true);
    const ac = new AbortController();
    tryAbortRef.current = ac;
    try {
      const res = await api.post<{
        ok: boolean;
        reply: string;
        session_id?: string;
        error?: string;
      }>(
        `/v1/dev/depts/${draftId}/try_chat`,
        { message: text, session_id: trySessionId },
        { signal: ac.signal },
      );
      if (res.session_id) setTrySessionId(res.session_id);
      setTryMessages((cur) => [
        ...cur,
        {
          id: `tc-${Date.now()}`,
          role: "copilot",
          text: res.reply || res.error || "(空回复)",
        },
      ]);
      if (!res.ok) {
        toast.error(res.error || res.reply || t("dev.studio.chat.try-error"));
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setTryMessages((cur) => [
          ...cur,
          {
            id: `tc-cancel-${Date.now()}`,
            role: "copilot",
            text: t("dev.studio.chat.try-cancelled"),
          },
        ]);
        return;
      }
      const err = apiErrorMessage(e, t("dev.studio.chat.try-error"));
      setTryMessages((cur) => [
        ...cur,
        { id: `tc-err-${Date.now()}`, role: "copilot", text: err },
      ]);
      toast.error(err);
    } finally {
      if (tryAbortRef.current === ac) tryAbortRef.current = null;
      setTryBusy(false);
    }
  }, [draftId, tryBusy, trySessionId, toast, t]);

  const onSendToRecruiter = useCallback((snippet: string) => {
    const prompt = t("dev.studio.chat.fix-prompt", {
      text: snippet.trim().slice(0, 1200),
    });
    setChatMode("recruiter");
    setComposeSeed(prompt);
  }, [t]);

  const startRename = useCallback(() => {
    if (!draft) return;
    setRenameVal(draft.name);
    // Prefill slug from current id when still untitled / non-ascii display.
    const fromId = draft.id.replace(/^dept-/i, "");
    const prefill = sanitizeDeptShort(draft.name)
      || (fromId && !/^untitled(?:-\d+)?$/i.test(fromId) ? fromId : "");
    setRenameSlug(prefill);
    setRenaming(true);
  }, [draft]);

  const renameNeedsSlug = needsDeptSlug(renameVal);

  const onRename = useCallback(async () => {
    const name = renameVal.trim();
    if (!name || !draftId) {
      setRenaming(false);
      return;
    }
    const slug = sanitizeDeptShort(renameSlug || name);
    if (needsDeptSlug(name) && !slug) {
      toast.error(t("dev.studio.rename-slug-required"));
      return;
    }
    const sameName = name === draft?.name;
    const sameId = !slug || `dept-${slug}` === draftId;
    if (sameName && sameId) {
      setRenaming(false);
      return;
    }
    setRenaming(false);
    try {
      const body: { name: string; slug?: string } = { name };
      if (slug) body.slug = slug;
      const d = await api.patch<BuilderDraft>(`/v1/dev/depts/${draftId}`, body);
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
  }, [renameVal, renameSlug, draftId, draft?.name, navigate, toast, t]);

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
              <div className="flex flex-col gap-1.5">
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => {
                    if (!renameNeedsSlug) onRename();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !renameNeedsSlug) onRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  placeholder={t("dev.studio.rename")}
                  className="font-display text-lg text-heading bg-surface border border-primary rounded px-2 py-0.5 outline-none w-56"
                />
                {renameNeedsSlug && (
                  <div className="flex flex-col gap-0.5">
                    <input
                      value={renameSlug}
                      onChange={(e) => setRenameSlug(e.target.value)}
                      onBlur={onRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRename();
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      placeholder={t("dev.studio.rename-slug")}
                      className="font-mono text-xs text-body bg-surface border border-border-solid rounded px-2 py-1 outline-none w-56 focus:border-primary"
                    />
                    <span className="text-[10px] text-muted leading-snug max-w-xs">
                      {t("dev.studio.rename-slug-hint")}
                    </span>
                  </div>
                )}
              </div>
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
          {view === "publish" ? (
            <button
              type="button"
              onClick={() => setView("develop")}
              className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary hover:text-primary"
            >
              {t("dev.studio.publish.back")}
            </button>
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
              <button
                type="button"
                onClick={() => toast.info(t("dev.studio.action.stub"))}
                className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary hover:text-primary"
              >
                {t("dev.studio.action.fork")}
              </button>
              <button
                type="button"
                disabled={!draftCanTry(draft)}
                title={
                  draftCanTry(draft)
                    ? t("dev.studio.chat.mode-try-hint")
                    : t("dev.studio.chat.try-disabled")
                }
                onClick={() => {
                  setView("develop");
                  setChatMode("try");
                }}
                className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border-solid disabled:hover:text-body"
              >
                {t("dev.studio.action.testdrive")}
              </button>
            </>
          )}
        </div>
      </header>

      {(reviewing || (liveReview && ["failed", "error", "stale", "passed"].includes(liveReview.status))) && (
        <SecurityReviewOverlay
          review={liveReview || draft.security_review || null}
          onRetry={() => { void onSubmit(); }}
          onBack={() => {
            const sr = liveReview || draft.security_review || null;
            const { notice, prompt } = buildReviewRemediation(sr, t);
            setLiveReview(null);
            setView("develop");
            setChatMode("recruiter");
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
        /* 三栏：文件（最左） | 节点图预览（中间） | 聊天（最右） */
        <div className="flex-1 flex min-h-0">
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
            mode={chatMode}
            onModeChange={setChatMode}
            canTry={draftCanTry(draft)}
            tryDisabledReason={t("dev.studio.chat.try-disabled")}
            deptLabel={draft ? `${draft.emoji || ""} ${draft.name}`.trim() : t("dev.studio.chat.mode-try")}
            messages={chatMode === "try" ? tryMessages : messages}
            onSend={chatMode === "try" ? (text) => { void onTrySend(text); } : onSend}
            onCancel={onCancel}
            busy={chatMode === "try" ? tryBusy : busy}
            toolStatus={chatMode === "try" ? null : toolStatus}
            composeSeed={chatMode === "recruiter" ? composeSeed : null}
            onComposeSeedConsumed={() => setComposeSeed(null)}
            onSendToRecruiter={onSendToRecruiter}
          />
        </div>
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

// ── right: vibe chat ────────────────────────────────────────────────────────
function TypingDots({ label }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-muted"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="inline-flex items-end gap-[3px] h-3" aria-hidden>
        <span className="chat-typing-dot block size-1 rounded-full bg-primary" />
        <span className="chat-typing-dot block size-1 rounded-full bg-primary" />
        <span className="chat-typing-dot block size-1 rounded-full bg-primary" />
      </span>
      {label ? <span className="chat-wait-pulse text-[11px]">{label}</span> : null}
    </span>
  );
}

/** Waiting / thinking presence for Recruiter — entrance + orbit mark + shimmer. */
function RecruiterWaiting({ label }: { label?: string }) {
  return (
    <div
      className="recruiter-bubble-in max-w-[85%] rounded-md px-3 py-2.5 text-xs leading-relaxed bg-surface border border-border-solid text-body shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)]"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-2.5">
        <span className="recruiter-wait-mark" aria-hidden>
          <span className="relative z-[1] text-[11px] font-semibold leading-none">R</span>
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest recruiter-label-shimmer">
            Recruiter
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-end gap-[3px] h-3" aria-hidden>
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
              <span className="chat-typing-dot block size-1.5 rounded-full bg-primary" />
            </span>
            {label ? (
              <span className="chat-wait-pulse text-[11px] text-muted truncate">{label}</span>
            ) : null}
          </div>
          <div className="recruiter-wait-bar" aria-hidden>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

function VibeChat({
  width, mode, onModeChange, canTry, tryDisabledReason, deptLabel,
  messages, onSend, onCancel, busy, toolStatus,
  composeSeed, onComposeSeedConsumed, onSendToRecruiter,
}: {
  width: number;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  canTry: boolean;
  tryDisabledReason: string;
  deptLabel: string;
  messages: ChatMsg[];
  onSend: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  toolStatus: string | null;
  composeSeed?: string | null;
  onComposeSeedConsumed?: () => void;
  onSendToRecruiter?: (snippet: string) => void;
}) {
  const { t } = useTranslation();
  // Keep each mode's draft input when switching tabs.
  const [inputs, setInputs] = useState<Record<ChatMode, string>>({
    recruiter: "",
    try: "",
  });
  const input = inputs[mode];
  const setInput = (value: string) =>
    setInputs((cur) => (cur[mode] === value ? cur : { ...cur, [mode]: value }));
  // 只滚聊天容器自己 —— scrollIntoView 会把所有可滚祖先（包括页面）一起滚，
  // 右侧预览会被带着动。
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMsg = messages[messages.length - 1];
  const waitingForReply = busy && (!lastMsg || lastMsg.role !== "copilot" || !lastMsg.text);
  const isTry = mode === "try";
  const assistantLabel = isTry ? deptLabel : "Recruiter";
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMsg?.text, busy, toolStatus, waitingForReply, mode]);

  useEffect(() => {
    if (!composeSeed || mode !== "recruiter") return;
    setInputs((cur) => ({ ...cur, recruiter: composeSeed }));
    onComposeSeedConsumed?.();
    // Focus after paint so the user can hit Send immediately.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    });
  }, [composeSeed, onComposeSeedConsumed, mode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    if (isTry && !canTry) return;
    onSend(text);
    setInput("");
  };

  const waitingLabel = isTry
    ? t("dev.studio.chat.try-waiting")
    : toolStatus
      ? t("dev.studio.chat.tool-running", { tool: toolStatus })
      : t("dev.studio.chat.waiting");

  const placeholder = isTry
    ? t("dev.studio.chat.try-placeholder")
    : t("dev.studio.chat.placeholder");

  return (
    <aside
      style={{ width }}
      className="shrink-0 border-s border-border-solid flex flex-col min-h-0 bg-surface/40"
    >
      <div className="px-3 py-2 border-b border-border-solid shrink-0 flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border-solid p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onModeChange("recruiter")}
            className={`rounded px-2.5 py-1 transition ${
              !isTry
                ? "bg-primary text-bg"
                : "text-muted hover:text-body"
            }`}
          >
            {t("dev.studio.chat.mode-recruiter")}
          </button>
          <button
            type="button"
            disabled={!canTry && !isTry}
            title={canTry ? t("dev.studio.chat.mode-try-hint") : tryDisabledReason}
            onClick={() => {
              if (!canTry) return;
              onModeChange("try");
            }}
            className={`rounded px-2.5 py-1 transition ${
              isTry
                ? "bg-primary text-bg"
                : "text-muted hover:text-body disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {t("dev.studio.chat.mode-try")}
          </button>
        </div>
        {busy && (
          <span className="ms-auto">
            <TypingDots label={waitingLabel} />
          </span>
        )}
      </div>
      {isTry && (
        <div className="px-4 py-1.5 border-b border-border-solid text-[11px] text-muted shrink-0">
          {t("dev.studio.chat.try-banner")}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.length === 0 && !busy && (
          <p className="text-[11px] text-muted leading-relaxed">
            {isTry
              ? t("dev.studio.chat.try-empty")
              : t("dev.studio.chat.recruiter-empty")}
          </p>
        )}
        {messages.map((m, index) => {
          // Empty assistant placeholders only animate while they are the
          // current (last) in-flight bubble. Older empties are hidden so
          // previous "正在回复" cards never keep pulsing.
          if (m.role === "copilot" && !m.text) {
            const isCurrentWait = busy && index === messages.length - 1;
            if (!isCurrentWait) return null;
            return (
              <div key={m.id} className="flex justify-start">
                {isTry ? (
                  <div className="max-w-[85%] rounded-md px-3 py-2 text-xs bg-surface border border-border-solid">
                    <div className="text-[10px] uppercase tracking-widest text-spark-mint mb-1">
                      {assistantLabel}
                    </div>
                    <TypingDots label={waitingLabel} />
                  </div>
                ) : (
                  <RecruiterWaiting label={waitingLabel} />
                )}
              </div>
            );
          }
          return (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-surface-2 text-body whitespace-pre-wrap"
                  : "recruiter-bubble-in bg-surface border border-border-solid text-body"
              }`}>
                {m.role === "copilot" ? (
                  <>
                    <div className={`text-[10px] uppercase tracking-widest mb-1 ${
                      isTry ? "text-spark-mint" : "text-primary"
                    }`}>
                      {assistantLabel}
                    </div>
                    {m.text ? <Markdown text={m.text} /> : null}
                    {isTry && m.text && onSendToRecruiter && (
                      <button
                        type="button"
                        onClick={() => onSendToRecruiter(m.text)}
                        className="mt-2 text-[10px] text-primary hover:underline"
                      >
                        {t("dev.studio.chat.send-to-recruiter")}
                      </button>
                    )}
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          );
        })}
        {/* Trailing wait only before the assistant bubble exists. Once an
            empty streaming bubble is appended, that bubble owns the animation. */}
        {waitingForReply && lastMsg?.role === "user" && (
          <div className="flex justify-start">
            {isTry ? (
              <div className="max-w-[85%] rounded-md px-3 py-2 text-xs bg-surface border border-border-solid">
                <div className="text-[10px] uppercase tracking-widest text-spark-mint mb-1">
                  {assistantLabel}
                </div>
                <TypingDots label={waitingLabel} />
              </div>
            ) : (
              <RecruiterWaiting label={waitingLabel} />
            )}
          </div>
        )}
        {busy && toolStatus && lastMsg?.role === "copilot" && lastMsg.text && (
          <div className="text-[11px] text-muted px-1 flex items-center gap-1.5">
            <span className="chat-wait-pulse inline-block size-1.5 rounded-full bg-spark-flare" aria-hidden />
            <span>{t("dev.studio.chat.tool-running", { tool: toolStatus })}</span>
          </div>
        )}
      </div>
      <div className="border-t border-border-solid p-3 shrink-0">
        <form onSubmit={submit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts newline (remediation prompts are multi-line).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
            placeholder={isTry && !canTry ? tryDisabledReason : placeholder}
            disabled={busy || (isTry && !canTry)}
            rows={input.includes("\n") || input.length > 80 ? 5 : 2}
            className="flex-1 min-h-[2.5rem] max-h-40 resize-y bg-surface border border-border-solid rounded px-3 py-1.5 text-sm text-body placeholder:text-dim focus:border-primary outline-none disabled:opacity-60"
          />
          {busy ? (
            <button type="button" onClick={onCancel} className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-fusion hover:text-fusion shrink-0">
              {t("dev.studio.chat.cancel")}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isTry && !canTry}
              className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition shrink-0 disabled:opacity-50"
            >
              {t("dev.studio.chat.send")}
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}

// ── middle: 节点图预览（就绪度已挪到整页发布视图）──────────────────────────
function PreviewPane({ draft }: { draft: BuilderDraft }) {
  const { t } = useTranslation();
  return (
    <main className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="border-b border-border-solid px-4 py-2 text-xs text-muted shrink-0">
        {t("dev.studio.tab.canvas")}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <DraftCanvas draft={draft} />
      </div>
    </main>
  );
}

// ── left: files panel（常驻最左栏）──────────────────────────────────────────
function FilesPanel({ draft, width }: { draft: BuilderDraft; width: number }) {
  const { t } = useTranslation();
  return (
    <aside
      style={{ width }}
      className="shrink-0 border-e border-border-solid flex flex-col min-h-0 bg-surface/40"
    >
      <div className="px-4 py-2.5 border-b border-border-solid text-xs uppercase tracking-widest text-muted shrink-0">
        📄 {t("dev.studio.tab.files", { defaultValue: "文件" })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <FilesExplorer draft={draft} />
      </div>
    </aside>
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
            fitViewOptions={{ padding: 0.32 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(212, 168, 78, 0.12)" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

// ── files explorer: 按 dept-* 目录契约（dept-drama 形态）分组 ────────────────
// 部门根目录 = 部长（主 Agent）的 bootstrap MDs；agents / config / hooks /
// mcp / skills 五个标准目录后端保证每次创建都存在（即使为空），这里恒常
// 显示；子 Agent 全部挂在 agents/<slug>/ 下。
const STD_DIRS = ["agents", "config", "hooks", "mcp", "skills"] as const;
type StdDir = (typeof STD_DIRS)[number];
const DIR_ICON: Record<StdDir, string> = {
  agents: "🤖", config: "⚙️", hooks: "🪝", mcp: "🔌", skills: "🧩",
};

interface AgentGroup { slug: string; label: string; files: DraftFile[] }
interface DirSection { dir: StdDir; files: DraftFile[]; agents: AgentGroup[] }

function groupDraftFiles(draft: BuilderDraft): { lead: DraftFile[]; dirs: DirSection[] } {
  const lead: DraftFile[] = [];
  const byDir = new Map<string, DraftFile[]>(STD_DIRS.map((d) => [d, []]));
  for (const f of draft.files) {
    const top = f.name.includes("/") ? f.name.split("/")[0] : "";
    const bucket = byDir.get(top);
    if (bucket) bucket.push(f);
    else lead.push(f);
  }
  const nameBySlug = new Map(draft.agents.map((a) => [a.slug, a.display_name]));
  const dirs: DirSection[] = STD_DIRS.map((dir) => {
    const files = byDir.get(dir)!;
    if (dir !== "agents") return { dir, files, agents: [] };
    const byAgent = new Map<string, DraftFile[]>();
    for (const f of files) {
      const slug = f.name.split("/")[1] ?? "";
      if (!byAgent.has(slug)) byAgent.set(slug, []);
      byAgent.get(slug)!.push(f);
    }
    const agents: AgentGroup[] = [...byAgent.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([slug, fs]) => ({ slug, label: nameBySlug.get(slug) || slug, files: fs }));
    return { dir, files, agents };
  });
  return { lead, dirs };
}

function FileBtn({
  file, selected, indent, label, onSelect,
}: {
  file: DraftFile; selected: boolean; indent: "md" | "lg"; label: string;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(file.name)}
      title={file.name}
      className={`w-full text-start ${indent === "lg" ? "ps-9" : "ps-7"} pe-3 py-1 text-xs font-mono truncate transition-colors ${
        selected
          ? "text-primary bg-primary/10 border-e-2 border-primary"
          : "text-body hover:text-primary hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );
}

function FilesExplorer({ draft, initialFile }: { draft: BuilderDraft; initialFile?: string }) {
  const { t } = useTranslation();
  const leadFallback = t("dev.studio.files.lead", { defaultValue: "部长（主 Agent）" });
  const { lead, dirs } = useMemo(() => groupDraftFiles(draft), [draft]);
  const [selected, setSelected] = useState<string | null>(initialFile ?? null);
  const file =
    draft.files.find((f) => f.name === selected)
    ?? draft.files.find((f) => f.name === "AGENTS.md")
    ?? draft.files[0];
  const leadAgent = draft.agents.find((a) => a.team_role === "orchestrator");

  const emptyRow = (
    <div className="ps-7 pe-3 py-1 text-xs text-dim italic">
      {t("dev.studio.files.dir-empty", { defaultValue: "（空）" })}
    </div>
  );

  return (
    <div className="h-full flex min-h-0">
      <aside className="w-48 shrink-0 border-e border-border-solid overflow-y-auto py-2">
        <div className="mb-1.5">
          <div
            className="px-3 py-1 flex items-center gap-1.5 text-[11px] text-muted uppercase tracking-wider truncate"
            title={leadAgent?.display_name || leadFallback}
          >
            <span>{draft.emoji || "👑"}</span>
            <span className="truncate">{leadAgent?.display_name || leadFallback}</span>
            <span className="text-dim">{lead.length}</span>
          </div>
          {lead.length ? lead.map((f) => (
            <FileBtn
              key={f.name} file={f} indent="md" label={f.name}
              selected={f.name === file?.name} onSelect={setSelected}
            />
          )) : emptyRow}
        </div>
        {dirs.map((sec) => (
          <div key={sec.dir} className="mb-1.5">
            <div className="px-3 py-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wider truncate">
              <span>{DIR_ICON[sec.dir]}</span>
              <span className="truncate font-mono">{sec.dir}/</span>
              <span className="text-dim">{sec.files.length}</span>
            </div>
            {sec.dir === "agents" ? (
              sec.agents.length ? sec.agents.map((g) => (
                <div key={g.slug}>
                  <div className="ps-6 pe-3 py-1 flex items-center gap-1.5 text-[11px] text-muted truncate" title={g.label}>
                    <span className="truncate font-mono">{g.slug}/</span>
                    <span className="text-dim truncate">{g.label}</span>
                  </div>
                  {g.files.map((f) => (
                    <FileBtn
                      key={f.name} file={f} indent="lg"
                      label={f.name.split("/").pop() ?? f.name}
                      selected={f.name === file?.name} onSelect={setSelected}
                    />
                  ))}
                </div>
              )) : emptyRow
            ) : (
              sec.files.length ? sec.files.map((f) => (
                <FileBtn
                  key={f.name} file={f} indent="md"
                  label={f.name.slice(sec.dir.length + 1)}
                  selected={f.name === file?.name} onSelect={setSelected}
                />
              )) : emptyRow
            )}
          </div>
        ))}
      </aside>
      <div className="flex-1 min-w-0">
        {file ? (
          <FileView file={file} />
        ) : (
          <div className="p-6">
            <EmptyState icon="📄" title={t("dev.studio.files.empty", { defaultValue: "还没有文件——先和 Recruiter 聊出一版草稿" })} />
          </div>
        )}
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
