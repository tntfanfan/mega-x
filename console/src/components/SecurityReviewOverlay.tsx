/**
 * Full-screen security review wait / result overlay for Studio publish.
 * Pure CSS radar + step list; data from real security_review polling.
 */

import { useTranslation } from "react-i18next";
import type { SecurityReviewInfo, SecurityReviewFinding } from "../lib/builderFixtures";

const STEP_I18N: Record<string, string> = {
  candidate: "dev.studio.review.step.candidate",
  political: "dev.studio.review.step.political",
  static: "dev.studio.review.step.static",
  secrets: "dev.studio.review.step.secrets",
  mcp: "dev.studio.review.step.mcp",
  llm: "dev.studio.review.step.llm",
  report: "dev.studio.review.step.report",
};

function severityColor(sev: string): string {
  if (sev === "high") return "text-fusion";
  if (sev === "medium") return "text-spark-flare";
  if (sev === "low") return "text-spark-blue";
  return "text-muted";
}

export function SecurityReviewOverlay({
  review,
  onRetry,
  onBack,
  onDone,
}: {
  review: SecurityReviewInfo | null;
  onRetry: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const status = review?.status || "running";
  const steps = review?.steps || [
    { key: "candidate", status: "pending" as const },
    { key: "political", status: "pending" as const },
    { key: "static", status: "pending" as const },
    { key: "secrets", status: "pending" as const },
    { key: "mcp", status: "pending" as const },
    { key: "llm", status: "pending" as const },
    { key: "report", status: "pending" as const },
  ];
  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / Math.max(steps.length, 1)) * 100);
  const failed = status === "failed" || status === "error" || status === "stale";
  const passed = status === "passed";
  const running = status === "queued" || status === "running";

  const findings = review?.findings || [];
  const logs = buildLogs(steps, findings, t);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/92 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-xl border border-border-solid bg-surface shadow-xl overflow-hidden">
        <div className="px-6 pt-8 pb-4 flex flex-col items-center">
          <div
            className={`relative w-28 h-28 rounded-full flex items-center justify-center ${
              failed ? "review-radar-failed" : passed ? "review-radar-passed" : "review-radar"
            }`}
            aria-hidden
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, ${
                  failed ? "var(--fusion, #e85d4c)" : "var(--spark-mint, #3dcf9a)"
                } ${pct}%, transparent ${pct}%)`,
                opacity: 0.35,
              }}
            />
            <span className="relative text-3xl">{failed ? "✕" : passed ? "🛡" : "🛡"}</span>
          </div>
          <h3 className="mt-4 font-display text-lg text-heading">
            {passed
              ? t("dev.studio.review.passed-title")
              : failed
                ? t(`dev.studio.review.${status}-title`)
                : t("dev.studio.review.running-title")}
          </h3>
          <p className="text-sm text-muted mt-1 text-center max-w-sm">
            {passed
              ? t("dev.studio.review.passed-hint", {
                  policy: review?.policy_version || "1",
                  listed: review?.listed ? t("dev.studio.review.listed") : "",
                  activated: review?.activated === false
                    ? t("dev.studio.review.activate-failed")
                    : t("dev.studio.review.activated"),
                })
              : failed
                ? (review?.error_message || review?.report_md?.slice(0, 160) || t(`dev.studio.review.${status}-hint`))
                : t("dev.studio.review.running-hint")}
          </p>
        </div>

        <ul className="px-6 space-y-2">
          {steps.map((s) => {
            const label = t(STEP_I18N[s.key] || s.key);
            const icon =
              s.status === "done" ? "✓" :
              s.status === "failed" ? "✕" :
              s.status === "running" ? "…" : "·";
            const color =
              s.status === "done" ? "text-spark-mint" :
              s.status === "failed" ? "text-fusion" :
              s.status === "running" ? "text-spark-flare" : "text-muted";
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className={`w-4 text-center ${color}`} aria-hidden>
                  {s.status === "running" ? (
                    <span className="inline-flex gap-0.5 chat-typing-dot">
                      <i /><i /><i />
                    </span>
                  ) : icon}
                </span>
                <span className={s.status === "pending" ? "text-muted" : "text-body"}>{label}</span>
              </li>
            );
          })}
        </ul>

        <div className="mx-6 mt-4 mb-2 h-28 overflow-y-auto rounded-md border border-border-solid bg-bg/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
          {logs.length === 0 && running && <div>{t("dev.studio.review.log-waiting")}</div>}
          {logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
        </div>

        {failed && findings.length > 0 && (
          <div className="mx-6 mb-3 max-h-36 overflow-y-auto space-y-1.5">
            {findings.slice(0, 12).map((f, i) => (
              <FindingRow key={f.fingerprint || i} finding={f} />
            ))}
          </div>
        )}

        <div className="px-6 py-4 flex items-center gap-3 border-t border-border-solid">
          {running && (
            <span className="text-xs text-muted chat-wait-pulse">{t("dev.studio.review.scanning")}</span>
          )}
          {passed && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium hover:bg-accent transition"
            >
              {t("dev.studio.review.done")}
            </button>
          )}
          {(status === "failed" || status === "error" || status === "stale") && (
            <>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium hover:bg-accent transition"
              >
                {t("dev.studio.review.retry")}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:bg-surface-2 transition"
              >
                {t("dev.studio.review.back-develop")}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .review-radar {
          box-shadow: 0 0 0 1px rgba(61, 207, 154, 0.25),
                      inset 0 0 24px rgba(61, 207, 154, 0.12);
          animation: review-pulse 2.4s ease-in-out infinite;
        }
        .review-radar::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 9999px;
          background: conic-gradient(from 0deg, transparent 0 70%, rgba(61,207,154,0.55) 100%);
          animation: review-spin 2.8s linear infinite;
          opacity: 0.7;
        }
        .review-radar-passed {
          box-shadow: 0 0 0 1px rgba(61, 207, 154, 0.5),
                      inset 0 0 28px rgba(61, 207, 154, 0.2);
        }
        .review-radar-failed {
          box-shadow: 0 0 0 1px rgba(232, 93, 76, 0.45),
                      inset 0 0 28px rgba(232, 93, 76, 0.15);
        }
        @keyframes review-spin { to { transform: rotate(360deg); } }
        @keyframes review-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}

function FindingRow({ finding }: { finding: SecurityReviewFinding }) {
  const loc = [finding.file, finding.line].filter(Boolean).join(":");
  return (
    <div className="rounded border border-border-solid px-2.5 py-1.5 text-xs">
      <span className={`font-medium ${severityColor(finding.severity)}`}>
        {finding.severity}
      </span>
      <span className="text-muted mx-1.5">{finding.rule}</span>
      <span className="text-body">{loc}</span>
      {finding.message && <div className="text-muted mt-0.5">{finding.message}</div>}
    </div>
  );
}

function buildLogs(
  steps: { key: string; status: string }[],
  findings: SecurityReviewFinding[],
  t: (k: string, o?: Record<string, string>) => string,
): string[] {
  const lines: string[] = [];
  for (const s of steps) {
    if (s.status === "pending") continue;
    const name = t(STEP_I18N[s.key] || s.key);
    if (s.status === "done") lines.push(`[${s.key}] ${name} … OK`);
    else if (s.status === "failed") lines.push(`[${s.key}] ${name} … FAIL`);
    else if (s.status === "running") lines.push(`[${s.key}] ${name} …`);
  }
  for (const f of findings.slice(0, 20)) {
    const loc = [f.file, f.line].filter(Boolean).join(":");
    lines.push(`[${f.rule || "finding"}] ${loc} ${f.message || ""}`.trim());
  }
  return lines;
}
