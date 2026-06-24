import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { api } from "../../../lib/api";
import type { Company, Task, Artifact, ActivityEvent } from "../../../lib/api";

type Ctx = { company: Company };

export default function TaskDetail() {
  const { company } = useOutletContext<Ctx>();
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<(Task & { artifacts: Artifact[] }) | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    if (!taskId) return;
    api.get<Task & { artifacts: Artifact[] }>(`/v1/companies/${company.id}/tasks/${taskId}`).then(setTask);
    api.get<{ items: ActivityEvent[] }>(`/v1/companies/${company.id}/tasks/${taskId}/timeline`).then((r) => setTimeline(r.items));
  }, [company.id, taskId]);

  if (!task) return <section className="p-6"><p className="text-body text-sm">Loading…</p></section>;
  const latest = task.artifacts[task.artifacts.length - 1];

  return (
    <section className="p-6 space-y-6">
      <Link to={`/business/c/${company.id}/tasks`} className="text-xs text-muted hover:text-primary">← 任务列表</Link>

      <header>
        <h1 className="font-display text-2xl text-heading">{task.title}</h1>
        <p className="text-sm text-muted mt-1">{task.brief}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-body">
          <span className="font-mono">{task.dept_id}</span>
          <span>·</span>
          <span>进度 {Math.round(task.progress * 100)}%</span>
          <span>·</span>
          <span>{task.token_used.toLocaleString()} tokens</span>
          <span>·</span>
          <span>¥{task.cost_yuan.toFixed(2)}</span>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">🕒 时间线</h2>
          <ul className="space-y-2 text-xs">
            {timeline.map((evt) => (
              <li key={evt.id} className="flex gap-2">
                <span className="text-muted shrink-0 w-12">{new Date(evt.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-body">{evt.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Latest artifact preview */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">📁 最新产出 ({task.artifacts.length})</h2>
          {task.artifacts.length === 0 ? (
            <p className="text-sm text-muted">尚无产出</p>
          ) : (
            <>
              <div className="mb-2 text-sm text-heading">{latest.name}</div>
              {latest.preview_text ? (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-body max-h-80 overflow-y-auto">{latest.preview_text}</pre>
              ) : (
                <p className="text-sm text-muted">无预览</p>
              )}
              <button className="mt-3 rounded-md bg-primary text-bg px-3 py-1 text-xs font-medium">下载</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
