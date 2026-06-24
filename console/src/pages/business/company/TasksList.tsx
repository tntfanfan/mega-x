/**
 * /business/c/:companyId/tasks — Tasks in this company.
 */

import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, Task } from "../../../lib/api";

type Ctx = { company: Company };

export default function TasksList() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get<{ items: Task[] }>(`/v1/companies/${company.id}/tasks`).then((r) => setTasks(r.items));
  }, [company.id]);

  return (
    <section className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-heading">{t("business.company.tasks.title")}</h1>
        </div>
        <Link
          to={`/business/c/${company.id}/tasks/new`}
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition"
        >
          {t("business.company.tasks.dispatch-new")}
        </Link>
      </header>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{t("business.company.tasks.empty")}</p>
      ) : (
        <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
          {tasks.map((task) => <TaskRow key={task.id} task={task} companyId={company.id} />)}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, companyId }: { task: Task; companyId: string }) {
  const stateBadge = {
    pending: { label: "🟡 待派发", color: "text-spark-flare" },
    in_progress: { label: "🔵 进行中", color: "text-spark-blue" },
    review: { label: "🟣 审稿中", color: "text-ai" },
    done: { label: "🟢 完成", color: "text-spark-mint" },
    cancelled: { label: "✕ 取消", color: "text-dim" },
    failed: { label: "❌ 失败", color: "text-fusion" },
  }[task.state];

  return (
    <Link
      to={`/business/c/${companyId}/tasks/${task.id}`}
      className="block px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-heading">{task.title}</div>
          <div className="text-[11px] text-muted mt-0.5 truncate">{task.brief}</div>
        </div>
        <span className={`text-xs ${stateBadge.color} shrink-0`}>{stateBadge.label}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="font-mono">{task.dept_id}</span>
        {task.state === "in_progress" && (
          <>
            <span>·</span>
            <span>{Math.round(task.progress * 100)}%</span>
            <span className="flex-1 max-w-32 h-1 rounded bg-surface-3 overflow-hidden">
              <span className="block h-full bg-primary" style={{ width: `${task.progress * 100}%` }} />
            </span>
          </>
        )}
        <span className="ml-auto">{task.expected_artifacts.join(" · ")}</span>
      </div>
    </Link>
  );
}
