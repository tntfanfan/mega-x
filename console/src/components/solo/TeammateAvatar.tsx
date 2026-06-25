/**
 * TeammateAvatar — 一个 AI 队友的头像。
 *
 * - 主理人（lead）右上角 👑
 * - 正在干活时外圈有脉冲环
 * - hover/click 显示完整身份（名字 + 角色 + soul 摘要 + 当前 bubble）
 *
 * 数据来自 Solo /v1/lines/:id/teammates 的 view model（每个 teammate 含 title_key
 * 等翻译过的字段）。
 */

import type { Agent, AgentStatus, AgentTeamRole } from "../../lib/api";

export interface TeammateView extends Agent {
  /** i18n key for the human-friendly title (e.g. "solo.group.content.lead") */
  title_key?: string;
  is_lead: boolean;
}

const ROLE_RING: Record<AgentTeamRole, string> = {
  orchestrator: "ring-spark-mint/40",
  builder: "ring-spark-blue/40",
  reviewer: "ring-spark-flare/40",
  ops: "ring-dim/40",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  working: "bg-spark-mint",
  idle: "bg-dim",
  blocked: "bg-spark-flare",
  done: "bg-spark-mint",
  error: "bg-fusion",
};

const ROLE_EMOJI: Record<AgentTeamRole, string> = {
  orchestrator: "🧑‍💼",
  builder: "🛠️",
  reviewer: "🔍",
  ops: "📊",
};

interface Props {
  teammate: TeammateView;
  title?: string;          // 已翻译的标题文字（由父组件 t(teammate.title_key)）
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

export function TeammateAvatar({ teammate, title, size = "md", onClick }: Props) {
  const sizeCls = size === "sm" ? "w-12 h-12 text-xl" : size === "lg" ? "w-20 h-20 text-3xl" : "w-16 h-16 text-2xl";
  const labelCls = size === "sm" ? "text-[10px]" : "text-xs";
  const working = teammate.status === "working";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group focus:outline-none"
    >
      <div className="relative">
        <div
          className={`${sizeCls} rounded-full bg-surface-2 border border-border-solid flex items-center justify-center transition-all
            ${working ? `ring-2 ${ROLE_RING[teammate.team_role]} animate-pulse` : ""}
            group-hover:border-primary`}
          title={`${title ?? teammate.display_name}\n${teammate.soul_summary}\n\n${teammate.bubble}`}
        >
          {ROLE_EMOJI[teammate.team_role]}
        </div>
        {/* lead crown */}
        {teammate.is_lead && (
          <div className="absolute -top-1 -right-1 text-base leading-none" aria-label="lead">
            👑
          </div>
        )}
        {/* status dot */}
        <div
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-bg ${STATUS_DOT[teammate.status]}`}
          aria-label={teammate.status}
        />
      </div>
      <div className={`${labelCls} text-body group-hover:text-primary truncate max-w-[80px] leading-tight text-center`}>
        {title ?? teammate.display_name}
      </div>
    </button>
  );
}
