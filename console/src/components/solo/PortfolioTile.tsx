/**
 * PortfolioTile — Solo 端"作品集"中的一张产出卡。
 *
 * 比 Business 的 "Outputs gallery" tile 更强调"作品"感：
 * - 大缩略图 / icon
 * - 标题 + 来自哪个"组"（Solo 视角的部门别名）
 * - 时间
 */

import type { Artifact, ArtifactType } from "../../lib/api";

const TYPE_ICON: Record<ArtifactType, string> = {
  markdown: "📄", code: "📑", json: "📑",
  image: "🖼", video: "🎬", audio: "🎵",
  table: "📊", pdf: "📕",
};

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

interface Props {
  artifact: Artifact;
  groupLabel?: string;   // 已翻译的"组"名（例如"内容组"）
  onClick?: () => void;
}

export function PortfolioTile({ artifact, groupLabel, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border-solid bg-surface p-4 text-left hover:border-primary transition-colors w-full"
    >
      {artifact.thumbnail_url ? (
        <div className="aspect-video bg-surface-2 rounded mb-3 overflow-hidden">
          <img src={artifact.thumbnail_url} alt={artifact.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video bg-surface-2 rounded mb-3 flex items-center justify-center text-4xl text-muted">
          {TYPE_ICON[artifact.type] ?? "📦"}
        </div>
      )}
      <div className="text-sm text-heading truncate">{artifact.name}</div>
      <div className="text-[11px] text-muted mt-1 flex items-center justify-between gap-2">
        <span className="truncate">{groupLabel ?? artifact.dept_id}</span>
        <span className="shrink-0">{fmtSize(artifact.size_bytes)}</span>
      </div>
      <div className="text-[10px] text-dim mt-0.5">{fmtTimeAgo(artifact.created_at)}</div>
    </button>
  );
}
