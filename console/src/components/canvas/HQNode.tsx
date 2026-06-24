/**
 * HQNode — 公司总部节点（画布中央）。
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Company } from "../../lib/api";

export interface HQNodeData extends Record<string, unknown> {
  company: Company;
  totalAgents: number;
  activeTasks: number;
}

export type HQNodeT = Node<HQNodeData, "hq">;

export function HQNode({ data, selected }: NodeProps<HQNodeT>) {
  const { company, totalAgents, activeTasks } = data;
  return (
    <div
      className={`rounded-md bg-gradient-to-br from-primary/20 to-surface-2 px-5 py-4 w-72 border-2 transition-colors ${
        selected ? "border-primary shadow-glass" : "border-primary/40"
      }`}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />

      <div className="flex items-start gap-3">
        <span className="text-3xl shrink-0">{company.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base text-heading truncate">{company.name}</div>
          <div className="text-[10px] text-muted font-mono truncate">{company.id}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-primary/20 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted">部门</div>
          <div className="text-sm text-heading">{company.dept_ids.length}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted">员工</div>
          <div className="text-sm text-heading">{totalAgents}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted">任务</div>
          <div className="text-sm text-spark-blue">{activeTasks}</div>
        </div>
      </div>
    </div>
  );
}
