/**
 * DeptNode — 单个部门的画布节点。
 *
 * 灵感来自 third_party/ai_company OrgCanvas/nodes/DepartmentNode.tsx 但：
 *  - agent 头像用 emoji + tier 配色（不用 SlimeAvatar 卡通）
 *  - 气泡台词用真 activity / 部门级氛围词（不用 preset BUBBLES）
 *  - 风格用 mega-x 金/暗调色板（不用 animal-island）
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DeptCatalogItem, Agent } from "../../lib/api";

export interface DeptNodeData extends Record<string, unknown> {
  dept: DeptCatalogItem;
  agents: Agent[];
  activeTasks: number;
  bubble: string;
  bubbleActive: boolean;
}

export type DeptNodeT = Node<DeptNodeData, "dept">;

const TEAM_ROLE_COLOR: Record<string, string> = {
  orchestrator: "bg-spark-mint text-bg",
  builder: "bg-spark-blue text-bg",
  reviewer: "bg-spark-flare text-bg",
  ops: "bg-dim text-heading",
};

export function DeptNode({ data, selected }: NodeProps<DeptNodeT>) {
  const { dept, agents, activeTasks, bubble, bubbleActive } = data;

  return (
    <div
      className={`rounded-md bg-surface px-3 py-2 w-56 border transition-colors ${
        selected ? "border-primary shadow-glass" : "border-border-solid hover:border-primary"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />

      <div className="flex items-start gap-2 mb-2">
        <span className="text-2xl shrink-0">{dept.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-heading truncate">{dept.name}</div>
          <div className="text-[9px] text-muted font-mono truncate">{dept.id}</div>
        </div>
        {activeTasks > 0 && (
          <span className="text-[9px] text-spark-blue bg-spark-blue/15 px-1 py-0.5 rounded shrink-0">
            {activeTasks}
          </span>
        )}
      </div>

      {/* Agent row */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {agents.slice(0, 8).map((a) => (
          <div
            key={a.id}
            title={`${a.display_name}\n${a.team_role} · ${a.tier}\n${a.bubble}`}
            className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold ${
              TEAM_ROLE_COLOR[a.team_role] ?? "bg-dim"
            } ${a.status === "working" ? "ring-2 ring-spark-mint/40" : ""}`}
          >
            {a.team_role[0].toUpperCase()}
          </div>
        ))}
        {agents.length > 8 && (
          <span className="text-[9px] text-muted">+{agents.length - 8}</span>
        )}
      </div>

      {/* Bubble */}
      <div className={`px-1.5 py-1 rounded text-[10px] truncate ${bubbleActive ? "bg-spark-mint/10 text-spark-mint" : "bg-surface-2 text-muted"}`}>
        💬 {bubble}
      </div>
    </div>
  );
}
