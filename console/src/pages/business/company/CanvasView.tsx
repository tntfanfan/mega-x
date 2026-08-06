/**
 * Org Canvas — React Flow HQ + 部门节点图。
 *
 * 现作为「部门」页左侧面板复用（见 DeptsView）。独立路由已取消。
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  type Node, type Edge, type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "../../../lib/api";
import type { Company, DeptCatalogItem, Agent, ActivityEvent } from "../../../lib/api";
import { DeptNode, type DeptNodeData } from "../../../components/canvas/DeptNode";
import { HQNode, type HQNodeData } from "../../../components/canvas/HQNode";
import { MessageEdge } from "../../../components/canvas/MessageEdge";

export interface DeptWithMeta extends DeptCatalogItem {
  agent_count: number;
  active_tasks: number;
}

const NODE_TYPES = { dept: DeptNode, hq: HQNode };
const EDGE_TYPES = { message: MessageEdge };

const LEGEND = [
  { key: "business.company.canvas.legend.orchestrator", swatch: "bg-spark-mint" },
  { key: "business.company.canvas.legend.builder", swatch: "bg-spark-blue" },
  { key: "business.company.canvas.legend.reviewer", swatch: "bg-spark-flare" },
  { key: "business.company.canvas.legend.ops", swatch: "bg-dim" },
] as const;

function layoutNodes(
  company: Company,
  depts: DeptWithMeta[],
  agentsByDept: Record<string, Agent[]>,
  activity: ActivityEvent[],
  t: (key: string) => string,
  selectedDeptId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const totalAgents = Object.values(agentsByDept).reduce((s, arr) => s + arr.length, 0);
  const activeTasks = depts.reduce((s, d) => s + d.active_tasks, 0);

  nodes.push({
    id: `hq:${company.id}`,
    type: "hq",
    position: { x: 0, y: 0 },
    data: { company, totalAgents, activeTasks } as HQNodeData,
    draggable: true,
    selectable: false,
  });

  const latestByDept = new Map<string, ActivityEvent>();
  for (const evt of activity.slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts))) {
    if (!latestByDept.has(evt.dept_id)) latestByDept.set(evt.dept_id, evt);
  }

  const MIN_ARC = 260;
  const radius = Math.max(380, (depts.length * MIN_ARC) / (2 * Math.PI));
  const angleStart = -Math.PI / 2;
  depts.forEach((d, i) => {
    const angle = angleStart + (i / Math.max(depts.length, 1)) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const agents = agentsByDept[d.id] ?? [];
    const evt = latestByDept.get(d.id);
    const bubble = evt?.text
      ?? (d.active_tasks > 0
        ? t("business.company.canvas.bubble.working")
        : t("business.company.canvas.bubble.idle"));
    nodes.push({
      id: `dept:${d.id}`,
      type: "dept",
      position: { x, y },
      data: {
        dept: d,
        agents,
        activeTasks: d.active_tasks,
        bubble,
        bubbleActive: d.active_tasks > 0,
      } as DeptNodeData,
      draggable: true,
      selected: selectedDeptId === d.id,
    });
    edges.push({
      id: `e:${company.id}-${d.id}`,
      source: `hq:${company.id}`,
      target: `dept:${d.id}`,
      type: "message",
      data: { active: d.active_tasks > 0 },
    });
  });

  return { nodes, edges };
}

export interface OrgCanvasPanelProps {
  company: Company;
  /** External dept list — when provided, skips its own depts fetch. */
  depts?: DeptWithMeta[];
  selectedDeptId?: string | null;
  onSelectDept?: (deptId: string | null) => void;
  /** Hide the legend strip (parent may render its own chrome). */
  showLegend?: boolean;
  /**
   * API root for this tenant. Defaults to `/v1/companies/:id`.
   * Solo lines pass `/v1/lines/:id` (same shapes, shared backend impl).
   */
  apiRoot?: string;
  className?: string;
}

export function OrgCanvasPanel({
  company,
  depts: deptsProp,
  selectedDeptId = null,
  onSelectDept,
  showLegend = true,
  apiRoot,
  className = "",
}: OrgCanvasPanelProps) {
  const { t } = useTranslation();
  const [deptsLocal, setDeptsLocal] = useState<DeptWithMeta[]>([]);
  const [agentsByDept, setAgentsByDept] = useState<Record<string, Agent[]>>({});
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const depts = deptsProp ?? deptsLocal;
  const root = apiRoot ?? `/v1/companies/${company.id}`;

  // Stable id list so we don't refetch agents when parent only reorders/recreates the array.
  const deptIdsKey = depts.map((d) => d.id).join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        let list: DeptWithMeta[];
        if (deptsProp) {
          list = deptsProp;
        } else {
          const deptRes = await api.get<{ items: DeptWithMeta[] }>(`${root}/depts`);
          if (cancelled) return;
          list = deptRes.items;
          setDeptsLocal(list);
        }
        const actRes = await api
          .get<{ items: ActivityEvent[] }>(`${root}/activity`)
          .catch(() => ({ items: [] as ActivityEvent[] }));
        if (cancelled) return;
        setActivity(actRes.items);
        const pairs = await Promise.all(
          list.map((d) =>
            api.get<{ items: Agent[] }>(`${root}/depts/${d.id}/agents`)
              .then((r) => [d.id, r.items] as [string, Agent[]])
              .catch(() => [d.id, [] as Agent[]] as [string, Agent[]])
          )
        );
        if (cancelled) return;
        setAgentsByDept(Object.fromEntries(pairs));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deptIdsKey tracks membership
  }, [company.id, deptIdsKey, root]);

  const { nodes, edges } = useMemo(
    () => layoutNodes(company, depts, agentsByDept, activity, t, selectedDeptId),
    [company, depts, agentsByDept, activity, t, selectedDeptId],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (!onSelectDept) return;
    if (node.id.startsWith("dept:")) onSelectDept(node.id.slice("dept:".length));
  }, [onSelectDept]);

  const onPaneClick = useCallback(() => {
    onSelectDept?.(null);
  }, [onSelectDept]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {showLegend && (
        <div className="px-4 py-2 border-b border-border-solid bg-surface/60 flex items-center gap-3 text-[11px] text-muted flex-wrap shrink-0">
          {LEGEND.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${l.swatch}`} aria-hidden />
              {t(l.key)}
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 relative bg-bg min-h-0">
        {loading ? (
          <p className="p-6 text-sm text-body">{t("common.loading")}…</p>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              style={{ background: "transparent" }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="rgba(212, 168, 78, 0.15)"
              />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
