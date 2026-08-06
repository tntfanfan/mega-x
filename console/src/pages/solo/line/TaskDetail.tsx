/**
 * /solo/l/:lineId/tasks/:taskId — 任务详情（与企业版同构，走 /v1/lines）。
 */

import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, Artifact, ActivityEvent, TaskState } from "../../../lib/api";
import { downloadArtifact } from "../../../lib/artifacts";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { line: Company };

const TYPE_ICON: Record<string, string> = {
  markdown: "📄", code: "📑", json: "📑",
  image: "🖼", video: "🎬", audio: "🎵", table: "📊", pdf: "📕",
};

const STATE_META: Record<TaskState, { emoji: string; color: string }> = {
  pending: { emoji: "🟡", color: "text-spark-flare" },
  in_progress: { emoji: "🔵", color: "text-spark-blue" },
  review: { emoji: "🟣", color: "text-ai" },
  done: { emoji: "🟢", color: "text-spark-mint" },
  cancelled: { emoji: "✕", color: "text-dim" },
  failed: { emoji: "❌", color: "text-fusion" },
};

const LIVE_STATES = new Set<TaskState>(["pending", "in_progress"]);
const POLL_MS = 3000;

export default function TaskDetail() {
  const { line } = useOutletContext<Ctx>();
  const { taskId } = useParams<{ taskId: string }>();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [task, setTask] = useState<(Task & { artifacts: Artifact[] }) | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      Promise.all([
        api.get<Task & { artifacts: Artifact[] }>(`/v1/lines/${line.id}/tasks/${taskId}`),
        api.get<{ items: ActivityEvent[] }>(`/v1/lines/${line.id}/tasks/${taskId}/timeline`),
      ])
        .then(([tk, tl]) => {
          if (cancelled) return;
          setTask(tk);
          setTimeline(tl.items);
          setSelectedId((cur) => {
            if (cur && tk.artifacts.some((a) => a.id === cur)) return cur;
            return tk.artifacts.length ? tk.artifacts[tk.artifacts.length - 1].id : null;
          });
          if (LIVE_STATES.has(tk.state)) {
            timer = setTimeout(() => load(true), POLL_MS);
          }
        })
        .catch((e) => {
          if (cancelled || isPoll) return;
          toast.error(apiErrorMessage(e, t("solo.line.tasks.detail.load-error")));
        });
    };

    load(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [line.id, taskId, toast, t]);

  if (!task) return <section className="p-6"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  const selected = task.artifacts.find((a) => a.id === selectedId) ?? task.artifacts[task.artifacts.length - 1];
  const stateMeta = STATE_META[task.state];
  const working = LIVE_STATES.has(task.state);

  return (
    <section className="p-6 space-y-6">
      <Link to={`/solo/l/${line.id}/tasks`} className="text-xs text-muted hover:text-primary">{t("solo.line.tasks.detail.back")}</Link>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-heading">{task.title}</h1>
          <span className={`text-xs ${stateMeta.color}`}>
            {stateMeta.emoji} {t(`task.state.${task.state}`)}
            {working ? ` · ${t("solo.line.tasks.detail.working")}` : ""}
          </span>
        </div>
        <p className="text-sm text-muted mt-1">{task.brief}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-body">
          <span className="font-mono">{task.dept_id}</span>
          <span>·</span>
          <span>{t("solo.line.tasks.detail.progress", { percent: Math.round(task.progress * 100) })}</span>
          <span>·</span>
          <span>{task.token_used.toLocaleString()} tokens</span>
          <span>·</span>
          <span>¥{task.cost_yuan.toFixed(2)}</span>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("solo.line.tasks.detail.timeline")}</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">
              {working
                ? t("solo.line.tasks.detail.waiting")
                : t("solo.line.tasks.detail.no-timeline")}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {timeline.map((evt) => (
                <li key={evt.id} className="flex gap-2">
                  <span className="text-muted shrink-0 w-12">{new Date(evt.ts).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-body">{evt.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("solo.line.tasks.detail.artifacts", { count: task.artifacts.length })}</h2>
          {task.artifacts.length === 0 || !selected ? (
            <p className="text-sm text-muted">
              {working
                ? t("solo.line.tasks.detail.waiting-artifacts")
                : t("solo.line.tasks.detail.no-artifacts")}
            </p>
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
