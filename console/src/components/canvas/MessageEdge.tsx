/**
 * MessageEdge — HQ↔dept / dept↔dept 之间的动画边。
 *
 * 简化版 ai_company EnergyEdge：金色线 + 流光动画（CSS dashoffset 动画）。
 * 高频活动的部门，箭头流速更快（active=true）。
 */

import { BaseEdge, type Edge, type EdgeProps, getSmoothStepPath } from "@xyflow/react";

export interface MessageEdgeData extends Record<string, unknown> {
  active?: boolean;
}

export type MessageEdgeT = Edge<MessageEdgeData, "message">;

export function MessageEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<MessageEdgeT>) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const active = data?.active ?? false;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: active ? "#D4A84E" : "rgba(212, 168, 78, 0.25)",
          strokeWidth: active ? 2 : 1,
          strokeDasharray: active ? "6 6" : "3 6",
          animation: active ? "dash 1.2s linear infinite" : "none",
        }}
      />
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -24; }
        }
      `}</style>
    </>
  );
}
