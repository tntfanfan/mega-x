/**
 * /dev/depts/:deptId/studio — For Builders Studio (v0 skeleton, mock-driven).
 *
 * Two-pane: vibe chat (placeholder) on the start side, a live preview on the
 * end side. The preview's "Preview" tab reuses the SAME buyer-facing canvas
 * nodes (HQNode / DeptNode / MessageEdge) so what the Builder builds is what
 * buyers will see. Other tabs show the generated files (with a diff toggle),
 * skills, and a publish-readiness meter.
 *
 * v0 is a clickable shell: chat is not yet wired to the dept-hr recruit/reorg
 * engine, and Test-drive/Submit are stubs. Design: doc/product/builders-studio-prd.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api, apiErrorMessage } from "../../lib/api";
import type { Company, DeptCatalogItem, Agent } from "../../lib/api";
import type { BuilderDraft, DraftFile, ChatMsg } from "../../lib/builderFixtures";
import { estCostPerTask } from "../../lib/builderFixtures";
import { HQNode, type HQNodeData } from "../../components/canvas/HQNode";
import { DeptNode, type DeptNodeData } from "../../components/canvas/DeptNode";
import { MessageEdge } from "../../components/canvas/MessageEdge";
import { useToast } from "../../components/ui/Toast";
import { EmptyState } from "../../components/ui/EmptyState";

const NODE_TYPES = { hq: HQNode, dept: DeptNode };
const EDGE_TYPES = { message: MessageEdge };

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
};

// ── canvas construction (reuses buyer node components) ──────────────────────
function buildCanvas(draft: BuilderDraft, companyLabel: string): { nodes: Node[]; edges: Edge[] } {
  const company: Company = {
    id: "you", name: companyLabel, template_slug: "-", state: "running",
    gateway_port: 0, dept_ids: [draft.id], token_usage_30d: 0, active_tasks: 0,
    created_at: "1970-01-01T00:00:00Z", emoji: "🏢",
    last_activity_at: "1970-01-01T00:00:00Z", last_activity_text: "",
  };
  const agents: Agent[] = draft.agents.map((a) => ({
    id: `${draft.id}-${a.slug}`, company_id: "you", dept_id: draft.id, slug: a.slug,
    display_name: a.display_name, team_role: a.team_role, tier: a.tier, status: "idle",
    soul_summary: "", bubble: "", skills_count: 0, recent_activity: [],
  }));
  const tier = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of draft.agents) tier[a.tier] += 1;
  const dept: DeptCatalogItem = {
    id: draft.id, name: draft.name, emoji: draft.emoji, short_desc: draft.mission,
    source_type: "marketplace", price_monthly: draft.price_monthly,
    role_count: draft.agents.length, tier_breakdown: tier, category: "creative",
  };
  const nodes: Node[] = [
    { id: "hq", type: "hq", position: { x: -32, y: 0 }, data: { company, totalAgents: agents.length, activeTasks: 0 } as HQNodeData, draggable: true },
    { id: "dept", type: "dept", position: { x: 0, y: 240 }, data: { dept, agents, activeTasks: 0, bubble: draft.mission || "—", bubbleActive: false } as DeptNodeData, draggable: true },
  ];
  const edges: Edge[] = [{ id: "e", source: "hq", target: "dept", type: "message", data: { active: false } }];
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

export default function DevStudio() {
  const { deptId } = useParams<{ deptId: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tab, setTab] = useState<string>("__canvas");

  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    api
      .get<BuilderDraft>(`/v1/dev/depts/${deptId}`)
      .then((d) => { if (!cancelled) { setDraft(d); setMessages(d.chat); } })
      .catch((e) => toast.error(apiErrorMessage(e, t("dev.studio.load-error"))));
    return () => { cancelled = true; };
  }, [deptId, toast, t]);

  const checks = useMemo(() => (draft ? computeReadiness(draft, t) : []), [draft, t]);
  const blocked = checks.some((c) => c.status === "fail" || c.status === "warn");
  const passes = checks.filter((c) => c.status === "pass").length;
  const scoreTotal = checks.filter((c) => c.status !== "info").length;

  if (!draft) {
    return <section className="container py-10"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <header className="border-b border-border-solid bg-surface px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dev/home" className="text-xs text-muted hover:text-primary shrink-0">{t("dev.studio.back")}</Link>
          <span className="text-2xl shrink-0">{draft.emoji}</span>
          <div className="min-w-0">
            <h1 className="font-display text-lg text-heading truncate">{draft.name}</h1>
            <span className={`text-[11px] ${DRAFT_STATE_COLOR[draft.state] ?? "text-muted"}`}>
              {t(`dev.dept.state.${draft.state}`)}
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
            disabled={blocked}
            title={blocked ? t("dev.studio.action.submit-blocked") : undefined}
            onClick={() => toast.info(t("dev.studio.action.stub"))}
            className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("dev.studio.action.submit")}
          </button>
        </div>
      </header>

      {/* Two-pane */}
      <div className="flex-1 flex min-h-0">
        <VibeChat messages={messages} onSend={(text) => {
          setMessages((cur) => [
            ...cur,
            { id: `u-${cur.length}`, role: "user", text },
            { id: `c-${cur.length}`, role: "copilot", text: t("dev.studio.chat.mock-reply") },
          ]);
        }} />
        <PreviewPane draft={draft} checks={checks} tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

// ── left: vibe chat ─────────────────────────────────────────────────────────
function VibeChat({ messages, onSend }: { messages: ChatMsg[]; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  return (
    <aside className="w-[40%] max-w-[460px] shrink-0 border-e border-border-solid flex flex-col min-h-0 bg-surface/40">
      <div className="px-4 py-2.5 border-b border-border-solid text-xs uppercase tracking-widest text-muted shrink-0">
        💬 {t("dev.studio.chat.title")}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
              m.role === "user"
                ? "bg-surface-2 text-body"
                : "bg-surface border border-border-solid text-body"
            }`}>
              {m.role === "copilot" && <div className="text-[10px] uppercase tracking-widest text-primary mb-1">Recruiter</div>}
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border-solid p-3 shrink-0">
        <div className="text-[10px] text-muted mb-2">{t("dev.studio.chat.mock-note")}</div>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("dev.studio.chat.placeholder")}
            className="flex-1 bg-surface border border-border-solid rounded px-3 py-1.5 text-sm text-body placeholder:text-dim focus:border-primary outline-none"
          />
          <button type="submit" className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent transition">
            {t("dev.studio.chat.send")}
          </button>
        </form>
      </div>
    </aside>
  );
}

// ── right: preview tabs ─────────────────────────────────────────────────────
function PreviewPane({ draft, checks, tab, setTab }: { draft: BuilderDraft; checks: Check[]; tab: string; setTab: (t: string) => void }) {
  const { t } = useTranslation();
  const tabs: { key: string; label: string }[] = [
    { key: "__canvas", label: t("dev.studio.tab.canvas") },
    ...draft.files.map((f) => ({ key: f.name, label: f.name })),
    { key: "__skills", label: t("dev.studio.tab.skills") },
    { key: "__readiness", label: t("dev.studio.tab.readiness") },
  ];
  const file = draft.files.find((f) => f.name === tab);

  return (
    <main className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="border-b border-border-solid px-4 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === tb.key ? "border-primary text-primary" : "border-transparent text-body hover:text-primary"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "__canvas" && <DraftCanvas draft={draft} />}
        {file && <FileView file={file} />}
        {tab === "__skills" && <SkillsList draft={draft} />}
        {tab === "__readiness" && <Readiness checks={checks} />}
      </div>
    </main>
  );
}

function DraftCanvas({ draft }: { draft: BuilderDraft }) {
  const { t } = useTranslation();
  const { nodes, edges } = useMemo(() => buildCanvas(draft, t("dev.studio.your-company")), [draft, t]);
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 text-[11px] text-muted shrink-0">{t("dev.studio.canvas.hint")}</div>
      <div className="flex-1 relative bg-bg min-h-0">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
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

function SkillsList({ draft }: { draft: BuilderDraft }) {
  const { t } = useTranslation();
  if (draft.skills.length === 0) {
    return <div className="p-6"><EmptyState icon="🧩" title={t("dev.studio.skills.empty")} /></div>;
  }
  return (
    <div className="p-4 space-y-2">
      {draft.skills.map((s) => (
        <div key={s.name} className="rounded-md border border-border-solid bg-surface px-3 py-2.5">
          <div className="text-sm text-heading font-mono">{s.name}</div>
          <div className="text-[11px] text-muted mt-0.5">{s.desc}</div>
        </div>
      ))}
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
