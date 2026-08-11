/**
 * Right-pane detail: each plan step as a row, with that step's artifacts nested.
 * Replaces the flat ArtifactGallery + compact stepper on the tasks list page.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Artifact, Task, TaskPlanStep, TaskPlanStepStatus } from "../../lib/api";
import { artifactDisplayName } from "../../lib/artifacts";
import { ArtifactPreviewModal } from "./ArtifactPreviewModal";
import type { ArtifactOwner } from "../../lib/artifacts";

const TYPE_ICON: Record<string, string> = {
  markdown: "📄",
  code: "📑",
  json: "📑",
  image: "🖼",
  video: "🎬",
  audio: "🎵",
  table: "📊",
  pdf: "📕",
};

function stepColor(status: TaskPlanStepStatus): string {
  if (status === "done") return "text-spark-mint border-spark-mint/40 bg-spark-mint/10";
  if (status === "failed") return "text-fusion border-fusion/40 bg-fusion/10";
  if (status === "running") return "text-spark-flare border-spark-flare/40 bg-spark-flare/10";
  return "text-muted border-border-solid bg-surface";
}

function stepGlyph(status: TaskPlanStepStatus): string {
  if (status === "done") return "✓";
  if (status === "failed") return "✕";
  if (status === "running") return "…";
  return "○";
}

function stepLabel(
  step: TaskPlanStep,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  if (step.label?.trim()) return step.label.trim();
  return t(`task.plan.step.${step.key}`, { defaultValue: step.key });
}

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function TaskStepOutputs({
  task,
  artifacts,
  owner,
  onDiscuss,
  onSolveStep,
}: {
  task: Task;
  artifacts: Artifact[];
  owner: ArtifactOwner;
  onDiscuss?: (art: Artifact) => void;
  onSolveStep?: (step: TaskPlanStep) => void;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Artifact | null>(null);
  const steps = task.plan ?? [];

  const byStep = useMemo(() => {
    const map = new Map<string, Artifact[]>();
    const unassigned: Artifact[] = [];
    const keys = new Set(steps.map((s) => s.key));
    for (const art of artifacts) {
      const sk = (art as Artifact & { step_key?: string | null }).step_key;
      if (sk && keys.has(sk)) {
        const list = map.get(sk) || [];
        list.push(art);
        map.set(sk, list);
      } else {
        unassigned.push(art);
      }
    }
    return { map, unassigned };
  }, [artifacts, steps]);

  if (steps.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted">
          {task.state === "pending" || task.state === "in_progress"
            ? t("task.plan.waiting")
            : t("task.plan.empty")}
        </p>
        {artifacts.length > 0 && (
          <ArtifactList
            items={artifacts}
            taskTitle={task.title}
            onOpen={setActive}
            onDiscuss={onDiscuss}
          />
        )}
        {active && (
          <ArtifactPreviewModal
            art={{ ...active, name: artifactDisplayName(active, task.title) }}
            owner={owner}
            onClose={() => setActive(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {t("task.plan.title")}
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const arts = byStep.map.get(step.key) || [];
          // Park legacy/unassigned files on the last step so they stay visible.
          const showUnassigned =
            i === steps.length - 1 ? byStep.unassigned : [];
          const all = [...arts, ...showUnassigned];
          return (
            <li
              key={`${step.key}-${i}`}
              className={`rounded-md border px-3 py-2.5 ${stepColor(step.status)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-mono w-4 text-center shrink-0" aria-hidden>
                    {stepGlyph(step.status)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-heading truncate">
                      {i + 1}. {stepLabel(step, t)}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {t(`task.plan.status.${step.status}`)}
                      {all.length > 0
                        ? ` · ${t("business.company.tasks.pane.step-outputs", { count: all.length })}`
                        : ""}
                    </div>
                  </div>
                </div>
                {step.status === "failed" && onSolveStep && (
                  <button
                    type="button"
                    onClick={() => onSolveStep(step)}
                    className="shrink-0 text-[11px] text-fusion hover:underline"
                  >
                    {t("business.company.chat.solve.action")}
                  </button>
                )}
              </div>
              {all.length > 0 ? (
                <div className="mt-2 ms-6">
                  <ArtifactList
                    items={all}
                    taskTitle={task.title}
                    onOpen={setActive}
                    onDiscuss={onDiscuss}
                  />
                </div>
              ) : step.status === "pending" ? (
                <p className="mt-1.5 ms-6 text-[11px] opacity-70">
                  {t("business.company.tasks.pane.step-pending")}
                </p>
              ) : step.status === "running" ? (
                <p className="mt-1.5 ms-6 text-[11px] opacity-70">
                  {t("business.company.tasks.pane.step-working")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {active && (
        <ArtifactPreviewModal
          art={{ ...active, name: artifactDisplayName(active, task.title) }}
          owner={owner}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ArtifactList({
  items,
  taskTitle,
  onOpen,
  onDiscuss,
}: {
  items: Artifact[];
  taskTitle: string;
  onOpen: (art: Artifact) => void;
  onDiscuss?: (art: Artifact) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded border border-border-solid/60 bg-bg/40 px-2 py-1.5 text-[11px]"
        >
          <button
            type="button"
            onClick={() => onOpen(a)}
            className="flex-1 min-w-0 text-start flex items-center gap-2 hover:text-primary"
          >
            <span aria-hidden>{TYPE_ICON[a.type] ?? "📦"}</span>
            <span className="truncate text-heading">
              {artifactDisplayName(a, taskTitle)}
            </span>
            <span className="text-muted shrink-0">{fmtSize(a.size_bytes)}</span>
          </button>
          {onDiscuss && (
            <button
              type="button"
              onClick={() => onDiscuss(a)}
              className="shrink-0 text-primary hover:underline"
            >
              {t("business.company.chat.discuss-artifact")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
