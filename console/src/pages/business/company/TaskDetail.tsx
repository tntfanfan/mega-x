import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, Artifact, ActivityEvent } from "../../../lib/api";
import { downloadArtifact } from "../../../lib/artifacts";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { company: Company };

const TYPE_ICON: Record<string, string> = {
  markdown: "📄", code: "📑", json: "📑",
  image: "🖼", video: "🎬", audio: "🎵", table: "📊", pdf: "📕",
};

export default function TaskDetail() {
  const { company } = useOutletContext<Ctx>();
  const { taskId } = useParams<{ taskId: string }>();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [task, setTask] = useState<(Task & { artifacts: Artifact[] }) | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    api
      .get<Task & { artifacts: Artifact[] }>(`/v1/companies/${company.id}/tasks/${taskId}`)
      .then((tk) => {
        setTask(tk);
        // Default the artifact switcher to the most recent output.
        setSelectedId(tk.artifacts.length ? tk.artifacts[tk.artifacts.length - 1].id : null);
      })
      .catch((e) => toast.error(apiErrorMessage(e, t("business.company.tasks.detail.load-error"))));
    api
      .get<{ items: ActivityEvent[] }>(`/v1/companies/${company.id}/tasks/${taskId}/timeline`)
      .then((r) => setTimeline(r.items))
      .catch((e) => toast.error(apiErrorMessage(e, t("business.company.tasks.detail.timeline-error"))));
  }, [company.id, taskId, toast, t]);

  if (!task) return <section className="p-6"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  const selected = task.artifacts.find((a) => a.id === selectedId) ?? task.artifacts[task.artifacts.length - 1];

  return (
    <section className="p-6 space-y-6">
      <Link to={`/business/c/${company.id}/tasks`} className="text-xs text-muted hover:text-primary">{t("business.company.tasks.detail.back")}</Link>

      <header>
        <h1 className="font-display text-2xl text-heading">{task.title}</h1>
        <p className="text-sm text-muted mt-1">{task.brief}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-body">
          <span className="font-mono">{task.dept_id}</span>
          <span>·</span>
          <span>{t("business.company.tasks.detail.progress", { percent: Math.round(task.progress * 100) })}</span>
          <span>·</span>
          <span>{task.token_used.toLocaleString()} tokens</span>
          <span>·</span>
          <span>¥{task.cost_yuan.toFixed(2)}</span>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("business.company.tasks.detail.timeline")}</h2>
          <ul className="space-y-2 text-xs">
            {timeline.map((evt) => (
              <li key={evt.id} className="flex gap-2">
                <span className="text-muted shrink-0 w-12">{new Date(evt.ts).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-body">{evt.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Artifacts — switch between all outputs of this task */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("business.company.tasks.detail.artifacts", { count: task.artifacts.length })}</h2>
          {task.artifacts.length === 0 || !selected ? (
            <p className="text-sm text-muted">{t("business.company.tasks.detail.no-artifacts")}</p>
          ) : (
            <>
              {task.artifacts.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {task.artifacts.map((a) => {
                    const active = a.id === selected.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className={`rounded px-2 py-1 text-[11px] border transition-colors ${
                          active
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-surface border-border-solid text-body hover:border-primary"
                        }`}
                      >
                        {TYPE_ICON[a.type] ?? "📦"} {a.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mb-2 text-sm text-heading">{selected.name}</div>
              {selected.preview_text ? (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-body max-h-80 overflow-y-auto">{selected.preview_text}</pre>
              ) : selected.thumbnail_url ? (
                <img src={selected.thumbnail_url} alt={selected.name} className="max-w-full rounded" />
              ) : (
                <p className="text-sm text-muted">{t("common.preview.none-download")}</p>
              )}
              <button
                onClick={() => {
                  const r = downloadArtifact(selected);
                  if (r === "started") toast.success(t("common.download-started", { name: selected.name }));
                  else toast.info(t("common.download-empty"));
                }}
                className="mt-3 rounded-md bg-primary text-bg px-3 py-1 text-xs font-medium hover:bg-accent transition-colors"
              >
                {t("common.download")}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
