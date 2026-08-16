import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { BuilderDraft, DraftAgent, DraftWorkflowStep } from "../../lib/builderFixtures";
import { AgentNode, type AgentNodeData } from "../canvas/AgentNode";

const NODE_TYPES = { agent: AgentNode };
const NODE_W = 224;
const COL_GAP = 128;
const ROW_H = 200;
const FAN_GAP = 72;
const STEP_Y0 = 240;

const GATE_LABEL_PROPS = {
  labelStyle: { fill: "var(--color-spark-flare, #e8a44a)", fontSize: 10 },
  labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
  labelBgPadding: [4, 2] as [number, number],
};

interface CanvasLane { name: string; entries: { step: DraftWorkflowStep; index: number }[] }

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
        edges.push({
          id: `e-lead-${id}`, source: "lead", target: id, type: "smoothstep", animated: true,
          style: { stroke: "rgba(212,168,78,0.7)" },
          label: multiLane && lane.name ? `▤ ${lane.name}` : undefined,
          labelStyle: { fill: "var(--color-primary, #d4a84e)", fontSize: 10 },
          labelBgStyle: { fill: "rgba(20,18,14,0.85)" },
          labelBgPadding: [4, 2] as [number, number],
        });
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

export function DraftCanvas({ draft }: { draft: BuilderDraft }) {
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

export function PreviewPane({ draft }: { draft: BuilderDraft }) {
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
