/**
 * AgentNode — Studio 预览画布上的单个 agent 节点（部长 / 子 Agent）。
 *
 * 与 DeptNode 同一套 mega-x 金/暗调风格，但粒度是"一个 agent"：
 * 部长节点强调"只编排不执行"，子 Agent 节点展示流水线序号、职责、
 * 动作/产出/门禁与绑定的 skills。
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DraftAgent } from "../../lib/builderFixtures";

export interface AgentNodeData extends Record<string, unknown> {
  agent: DraftAgent;
  isLead?: boolean;
  emoji?: string;
  /** 流水线序号（1-based）；不在工作流里的子 Agent 不显示。 */
  stepIndex?: number;
  action?: string;
  output?: string;
  gate?: string;
  /** 部长节点下方的说明（如"只编排不执行"）。 */
  leadNote?: string;
}

export type AgentNodeT = Node<AgentNodeData, "agent">;

const TEAM_ROLE_COLOR: Record<string, string> = {
  orchestrator: "bg-spark-mint text-bg",
  builder: "bg-spark-blue text-bg",
  reviewer: "bg-spark-flare text-bg",
  ops: "bg-dim text-heading",
};

const TIER_COLOR: Record<string, string> = {
  HIGH: "text-spark-flare",
  MEDIUM: "text-spark-blue",
  LOW: "text-muted",
};

export function AgentNode({ data, selected }: NodeProps<AgentNodeT>) {
  const { agent, isLead, emoji, stepIndex, action, output, gate, leadNote } = data;
  const roleCls = TEAM_ROLE_COLOR[agent.team_role] ?? "bg-dim text-heading";

  return (
    <div
      className={`rounded-md bg-surface px-3 py-2 w-56 border transition-colors ${
        selected
          ? "border-primary shadow-glass"
          : isLead
            ? "border-primary/60 hover:border-primary"
            : "border-border-solid hover:border-primary"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />

      <div className="flex items-start gap-2">
        <span className="text-xl shrink-0 leading-6">
          {isLead ? (emoji || "👑") : stepIndex != null ? (
            <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-mono">
              {stepIndex}
            </span>
          ) : "🤖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-heading truncate" title={agent.display_name}>
            {agent.display_name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[9px] px-1 py-px rounded ${roleCls}`}>{agent.team_role}</span>
            <span className={`text-[9px] font-mono ${TIER_COLOR[agent.tier] ?? "text-muted"}`}>{agent.tier}</span>
          </div>
        </div>
      </div>

      {isLead && leadNote && (
        <div className="mt-1.5 text-[10px] text-spark-mint">{leadNote}</div>
      )}

      {(agent.duty || action) && (
        <div className="mt-1.5 text-[10px] text-body leading-relaxed line-clamp-2" title={agent.duty || action}>
          {agent.duty || action}
        </div>
      )}

      {(action || output || gate) && !isLead && (
        <div className="mt-1.5 space-y-0.5 border-t border-border-solid pt-1.5">
          {action && (
            <div className="text-[10px] text-body truncate" title={action}>⚙ {action}</div>
          )}
          {output && (
            <div className="text-[10px] text-muted font-mono truncate" title={output}>→ {output}</div>
          )}
          {gate && (
            <div className="text-[10px] text-spark-flare truncate" title={gate}>🚧 {gate}</div>
          )}
        </div>
      )}

      {agent.skills && agent.skills.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {agent.skills.slice(0, 4).map((s) => (
            <span key={s} className="text-[9px] font-mono px-1 py-px rounded bg-surface-2 text-muted" title={`skills/${s}`}>
              🧩 {s}
            </span>
          ))}
          {agent.skills.length > 4 && (
            <span className="text-[9px] text-dim">+{agent.skills.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
