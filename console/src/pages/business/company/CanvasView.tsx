/**
 * /business/c/:companyId/ — Org Canvas (React Flow).
 *
 * 渲染 HQ + 部门节点环形布局，HQ→每个 dept 一条 MessageEdge。
 * 部门内的 agent 头像 + 实时气泡显示当前活动。
 *
 * 后续 S6/S7：右键菜单（招聘部门 / 改组）、单击 agent 弹抽屉换实例。
 * 后续 S10：WSS 接 /v1/companies/:id/activity，气泡实时更新。
 */

import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "../../../lib/api";
import type { Company, DeptCatalogItem, Agent, ActivityEvent } from "../../../lib/api";
import { DeptNode, type DeptNodeData } from "../../../components/canvas/DeptNode";
import { HQNode, type HQNodeData } from "../../../components/canvas/HQNode";
import { MessageEdge } from "../../../components/canvas/MessageEdge";

type Ctx = { company: Company };

interface DeptWithMeta extends DeptCatalogItem {
  agent_count: number;
  active_tasks: number;
}

const NODE_TYPES = { dept: DeptNode, hq: HQNode };
const EDGE_TYPES = { message: MessageEdge };

// HQ at center, depts on a circle around it.
function layoutNodes(
  company: Company,
  depts: DeptWithMeta[],
  agentsByDept: Record<string, Agent[]>,
  activity: ActivityEvent[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const totalAgents = Object.values(agentsByDept).reduce((s, arr) => s + arr.length, 0);
  const activeTasks = depts.reduce((s, d) => s + d.active_tasks, 0);

  // HQ at center (0, 0)
  nodes.push({
    id: `hq:${company.id}`,
    type: "hq",
    position: { x: 0, y: 0 },
    data: { company, totalAgents, activeTasks } as HQNodeData,
    draggable: true,
  });

  // 算每个 dept 最新活动事件
  const latestByDept = new Map<string, ActivityEvent>();
  for (const evt of activity.slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts))) {
    if (!latestByDept.has(evt.dept_id)) latestByDept.set(evt.dept_id, evt);
  }

  // Depts on a circle
  const radius = Math.max(380, 100 + depts.length * 22);
  const angleStart = -Math.PI / 2; // 第一个在顶部
  depts.forEach((d, i) => {
    const angle = angleStart + (i / depts.length) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const agents = agentsByDept[d.id] ?? [];
    const evt = latestByDept.get(d.id);
    const bubble = evt?.text ?? (d.active_tasks > 0 ? "工作中…" : "待命中");
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

export default function CanvasView() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [depts, setDepts] = useState<DeptWithMeta[]>([]);
  const [agentsByDept, setAgentsByDept] = useState<Record<string, Agent[]>>({});
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<{ items: DeptWithMeta[] }>(`/v1/companies/${company.id}/depts`),
      api.get<{ items: ActivityEvent[] }>(`/v1/companies/${company.id}/activity`).catch(() => ({ items: [] })),
    ])
      .then(async ([deptRes, actRes]) => {
        if (cancelled) return;
        setDepts(deptRes.items);
        setActivity(actRes.items);
        const pairs = await Promise.all(
          deptRes.items.map((d) =>
            api.get<{ items: Agent[] }>(`/v1/companies/${company.id}/depts/${d.id}/agents`)
              .then((r) => [d.id, r.items] as [string, Agent[]])
              .catch(() => [d.id, [] as Agent[]] as [string, Agent[]])
          )
        );
        if (cancelled) return;
        setAgentsByDept(Object.fromEntries(pairs));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id]);

  const { nodes, edges } = useMemo(
    () => layoutNodes(company, depts, agentsByDept, activity),
    [company, depts, agentsByDept, activity],
  );

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col">
      {/* Top strip */}
      <div className="px-6 py-3 border-b border-border-solid bg-surface/60 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-lg text-heading">{t("business.company.canvas.title")}</h1>
          <p className="text-xs text-muted">{t("business.company.canvas.subtitle")}</p>
        </div>
        <div className="flex gap-3 text-[11px] text-muted flex-wrap">
          <span>{t("business.company.canvas.legend.orchestrator")}</span>
          <span>{t("business.company.canvas.legend.builder")}</span>
          <span>{t("business.company.canvas.legend.reviewer")}</span>
          <span>{t("business.company.canvas.legend.ops")}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-bg">
        {loading ? (
          <p className="p-6 text-sm text-body">Loading…</p>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
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
