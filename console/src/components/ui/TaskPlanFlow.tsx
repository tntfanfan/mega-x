/**
 * Horizontal plan flowchart for a task — steps come from the agent after
 * intake (task-specific), not a fixed pipeline.
 */

import { useTranslation } from "react-i18next";

import type { Task, TaskPlanStep, TaskPlanStepStatus } from "../../lib/api";

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
  return String.fromCharCode(183); // ·
}

function stepLabel(
  step: TaskPlanStep,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  if (step.label?.trim()) return step.label.trim();
  // Only a few system keys have i18n; custom steps always carry a label.
  return t(`task.plan.step.${step.key}`, { defaultValue: step.key });
}

export function TaskPlanFlow({
  task,
  compact = false,
}: {
  task: Pick<Task, "state" | "progress" | "plan">;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const steps = task.plan ?? [];
  const working = task.state === "pending" || task.state === "in_progress";

  return (
    <div className={compact ? "" : "rounded-md border border-border-solid bg-surface p-4"}>
      {!compact && (
        <h2 className="text-xs uppercase tracking-widest text-muted mb-3">
          {t("task.plan.title")}
        </h2>
      )}
      {steps.length === 0 ? (
        <p className="text-xs text-muted">
          {working ? t("task.plan.waiting") : t("task.plan.empty")}
        </p>
      ) : (
        <ol className="flex flex-wrap items-center gap-1.5">
          {steps.map((step, i) => {
            const label = stepLabel(step, t);
            return (
              <li key={`${step.key}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span
                    className={`hidden sm:block w-4 h-px ${
                      step.status === "pending" ? "bg-border-solid" : "bg-primary/50"
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${stepColor(step.status)}`}
                  title={t(`task.plan.status.${step.status}`)}
                >
                  <span className="w-3 text-center font-mono" aria-hidden>
                    {step.status === "running" ? (
                      <span className="inline-flex gap-0.5 chat-typing-dot">
                        <i /><i /><i />
                      </span>
                    ) : (
                      stepGlyph(step.status)
                    )}
                  </span>
                  <span>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
