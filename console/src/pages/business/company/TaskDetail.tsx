import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task, Artifact, ActivityEvent, TaskState } from "../../../lib/api";
import { artifactDisplayName, downloadArtifact } from "../../../lib/artifacts";
import { resolveDeptDisplay } from "../../../lib/depts";
import { useToast } from "../../../components/ui/Toast";
import { ArtifactViewer } from "../../../components/ui/ArtifactViewer";
import { ArtifactPreviewModal } from "../../../components/ui/ArtifactPreviewModal";
import { TaskPlanFlow } from "../../../components/ui/TaskPlanFlow";
import { useDeptChat } from "./ChatProvider";

type Ctx = { company: Company };

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
  const { company } = useOutletContext<Ctx>();
  const { taskId } = useParams<{ taskId: string }>();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const chat = useDeptChat();
  const [task, setTask] = useState<(Task & { artifacts: Artifact[] }) | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const backTo = taskId
    ? `/business/c/${company.id}/tasks?task=${taskId}`
    : `/business/c/${company.id}/tasks`;

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      Promise.all([
        api.get<Task & { artifacts: Artifact[] }>(`/v1/companies/${company.id}/tasks/${taskId}`),
        api.get<{ items: ActivityEvent[] }>(`/v1/companies/${company.id}/tasks/${taskId}/timeline`),
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
          toast.error(apiErrorMessage(e, t("business.company.tasks.detail.load-error")));
        });
    };

    load(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [company.id, taskId, toast, t]);

  const deleteTask = async () => {
    if (!task || deleting) return;
    if (!window.confirm(t("task.delete.confirm", { title: task.title }))) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/companies/${company.id}/tasks/${task.id}`);
      toast.success(t("task.delete.success"));
      navigate(`/business/c/${company.id}/tasks`, { replace: true });
    } catch (e) {
      toast.error(apiErrorMessage(e, t("task.delete.error")));
      setDeleting(false);
    }
  };

  if (!task) return <section className="p-6"><p className="text-body text-sm">{t("common.loading")}…</p></section>;
  const selected = task.artifacts.find((a) => a.id === selectedId) ?? task.artifacts[task.artifacts.length - 1];
  const stateMeta = STATE_META[task.state];
  const working = LIVE_STATES.has(task.state);

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to={backTo} className="text-xs text-muted hover:text-primary">{t("business.company.tasks.detail.back")}</Link>
        <button
          type="button"
          disabled={deleting}
          onClick={() => void deleteTask()}
          className="text-xs text-muted hover:text-fusion disabled:opacity-50"
        >
          {deleting ? "…" : t("task.delete.action")}
        </button>
      </div>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-heading">{task.title}</h1>
          <span className={`text-xs ${stateMeta.color}`}>
            {stateMeta.emoji} {t(`task.state.${task.state}`)}
            {working ? ` · ${t("business.company.tasks.detail.working")}` : ""}
          </span>
          {task.source === "chat" && (
            <span className="text-[10px] uppercase tracking-widest text-muted border border-border-solid rounded px-1.5 py-0.5">
              {t("business.company.tasks.detail.source-chat")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted mt-1">{task.brief}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-body">
          <span>{resolveDeptDisplay(task.dept_id, chat.depts).label}</span>
          <span>·</span>
          <span>{t("business.company.tasks.detail.progress", { percent: Math.round(task.progress * 100) })}</span>
          <span>·</span>
          <span>{task.token_used.toLocaleString()} tokens</span>
          <span>·</span>
          <span>¥{task.cost_yuan.toFixed(2)}</span>
        </div>
      </header>

      <TaskPlanFlow task={task} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("business.company.tasks.detail.timeline")}</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">
              {working
                ? t("business.company.tasks.detail.waiting")
                : t("business.company.tasks.detail.no-timeline")}
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

        {/* Artifacts */}
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{t("business.company.tasks.detail.artifacts", { count: task.artifacts.length })}</h2>
          {task.artifacts.length === 0 || !selected ? (
            <p className="text-sm text-muted">
              {working
                ? t("business.company.tasks.detail.waiting-artifacts")
                : t("business.company.tasks.detail.no-artifacts")}
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
                        {TYPE_ICON[a.type] ?? "📦"} {artifactDisplayName(a, task.title)}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="w-full text-start mb-2 group"
              >
                <div className="text-sm text-heading group-hover:text-primary">
                  {artifactDisplayName(selected, task.title)}
                </div>
                <div className="text-[11px] text-primary mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {t("common.preview.open")}
                </div>
              </button>
              <div
                className="max-h-80 overflow-y-auto cursor-pointer"
                onClick={() => setPreviewOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setPreviewOpen(true);
                }}
                role="button"
                tabIndex={0}
              >
                <ArtifactViewer
                  art={selected}
                  owner={{ kind: "companies", id: company.id }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="rounded-md border border-border-solid px-3 py-1 text-xs text-body hover:text-primary hover:border-primary transition-colors"
                >
                  {t("common.preview.open")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const named = {
                      ...selected,
                      name: artifactDisplayName(selected, task.title),
                    };
                    const r = downloadArtifact(named);
                    if (r === "started") {
                      toast.success(
                        t("common.download-started", { name: named.name }),
                      );
                    } else toast.info(t("common.download-empty"));
                  }}
                  className="rounded-md bg-primary text-bg px-3 py-1 text-xs font-medium hover:bg-accent transition-colors"
                >
                  {t("common.download")}
                </button>
              </div>
              {previewOpen && (
                <ArtifactPreviewModal
                  art={{
                    ...selected,
                    name: artifactDisplayName(selected, task.title),
                  }}
                  owner={{ kind: "companies", id: company.id }}
                  onClose={() => setPreviewOpen(false)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
