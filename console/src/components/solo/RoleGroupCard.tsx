/**
 * RoleGroupCard — 一个"组"（= ai-native 部门）的成员展示。
 *
 * 例：内容组 [👑 主笔] [✍️ 写手#1] [✍️ 写手#2]
 *
 * 用户视角不暴露 dept_id，只显示组的 emoji + 翻译过的 label + 成员头像。
 */

import { useTranslation } from "react-i18next";

import { TeammateAvatar, type TeammateView } from "./TeammateAvatar";

export interface TeammateGroup {
  dept_id: string;
  group_emoji: string;
  label_key?: string;       // i18n key for "Content" / "Research" / ...
  fallback_label: string;   // 部门名（兜底）
  teammates: TeammateView[];
}

interface Props {
  group: TeammateGroup;
  onClickTeammate?: (t: TeammateView) => void;
  /** Remove this team from the line (optional — Team page wires it). */
  onRemove?: (group: TeammateGroup) => void;
  removing?: boolean;
}

export function RoleGroupCard({ group, onClickTeammate, onRemove, removing }: Props) {
  const { t } = useTranslation();
  const label = group.label_key ? t(group.label_key) : group.fallback_label;
  const leadCount = group.teammates.filter((tm) => tm.is_lead).length;
  return (
    <section className="rounded-md border border-border-solid bg-surface p-4 space-y-3">
      <header className="flex items-center gap-2">
        <span className="text-xl">{group.group_emoji}</span>
        <h3 className="font-display text-sm text-heading truncate">{label}</h3>
        <span className="text-[10px] text-muted shrink-0">
          {group.teammates.length}人 · {leadCount} {t("solo.line.team.lead-badge")}
        </span>
        {onRemove ? (
          <button
            type="button"
            disabled={removing}
            onClick={() => onRemove(group)}
            className="ms-auto shrink-0 rounded text-xs px-2 py-1 border border-fusion/50 text-fusion hover:bg-fusion/10 transition disabled:opacity-50"
          >
            {removing ? t("solo.line.team.removing") : t("solo.line.team.remove")}
          </button>
        ) : (
          <span className="ms-auto" />
        )}
      </header>
      <div className="flex flex-wrap gap-3">
        {group.teammates.map((tm) => (
          <TeammateAvatar
            key={tm.id}
            teammate={tm}
            title={tm.title_key ? t(tm.title_key) : tm.display_name}
            onClick={onClickTeammate ? () => onClickTeammate(tm) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
