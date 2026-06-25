/**
 * TeamStepCard — 一项任务的"步骤进度"卡片（Solo 端代替 Business 的 timeline）。
 *
 * 把后端 task + activity 的复杂时间线，**翻译**成超级个体能秒懂的 3-5 步：
 *   ✅ 选题：「...」
 *   🔵 调研中：5 篇文章（12 分钟剩余）
 *   ⏳ 起草
 *   ⏳ 审稿
 *   ⏳ 定时发布（周日 8:00）
 *
 * 把 dept_id / agent_id 全部隐藏起来 — 只显示「主笔」「调研员」这种翻译过的角色。
 */

import type { Task } from "../../lib/api";

interface Props {
  task: Task;
  /** 任务的关键步骤；如果不传，用默认 5 步从 task.state 生成 */
  steps?: { state: "done" | "active" | "pending"; label: string; meta?: string }[];
  onClick?: () => void;
}

function defaultSteps(task: Task): { state: "done" | "active" | "pending"; label: string; meta?: string }[] {
  const t = task.title;
  const isDone = task.state === "done";
  const isInProgress = task.state === "in_progress";
  const isReview = task.state === "review";
  const progress = task.progress;
  // 简单 5 步映射 progress 区间
  return [
    { state: progress >= 0.1 ? "done" : "active", label: `选题：${t}` },
    { state: progress >= 0.3 ? "done" : progress >= 0.1 ? "active" : "pending", label: "调研中" },
    { state: progress >= 0.7 ? "done" : progress >= 0.3 ? "active" : "pending", label: "起草初稿" },
    { state: isReview || isDone ? (isDone ? "done" : "active") : "pending", label: "审稿" },
    { state: isDone ? "done" : "pending", label: "定时发布" },
  ];
}

export function TeamStepCard({ task, steps, onClick }: Props) {
  const finalSteps = steps ?? defaultSteps(task);
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left rounded-md border border-border-solid bg-surface p-4 hover:border-primary transition-colors"
    >
      <header className="flex items-start gap-2 mb-3">
        <span className="shrink-0 mt-0.5">📋</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm text-heading truncate">{task.title}</h3>
          {task.brief && <p className="text-[11px] text-muted truncate mt-0.5">{task.brief}</p>}
        </div>
        {task.state === "in_progress" && (
          <span className="text-[10px] text-spark-blue shrink-0">{Math.round(task.progress * 100)}%</span>
        )}
      </header>
      <ol className="space-y-1.5">
        {finalSteps.map((s, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-4 inline-block">
              {s.state === "done" ? "✅" : s.state === "active" ? "🔵" : "⏳"}
            </span>
            <span className={s.state === "done" ? "text-muted line-through" : s.state === "active" ? "text-spark-blue" : "text-dim"}>
              {s.label}
              {s.meta && <span className="text-muted ml-1.5">({s.meta})</span>}
            </span>
          </li>
        ))}
      </ol>
    </button>
  );
}
