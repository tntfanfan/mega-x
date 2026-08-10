/**
 * /solo/lines/new — New line wizard.
 *
 * Mirrors business/companies/NewWizard: load templates, wait on provision
 * operation, toast on success/failure.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

interface LineTemplate {
  slug: string;
  emoji: string;
  name_key: string;
  desc_key: string;
  dept_ids: string[];
  monthly_output_estimate?: number;
  hours_saved_estimate?: number;
}

interface CreateLineResp {
  id: string;
  operation_id?: string;
  status?: string;
  state?: string;
}

async function waitForOperation(operationId: string, timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const op = await api.get<{ status: string; error?: string }>(`/v1/operations/${operationId}`);
    if (op.status === "done") return;
    if (op.status === "failed") throw new Error(op.error || "provision failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("provision timeout");
}

export default function SoloNewWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [templates, setTemplates] = useState<LineTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: LineTemplate[] }>("/v1/lines/templates")
      .then((r) => {
        if (cancelled) return;
        setTemplates(r.items);
        if (r.items.length > 0) setTplSlug(r.items[0].slug);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(apiErrorMessage(e, t("solo.lines.new.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const submit = async () => {
    if (!tplSlug) return;
    setSubmitting(true);
    setError(null);
    setProgress(null);
    try {
      const line = await api.post<CreateLineResp>("/v1/lines", {
        name: name.trim(),
        template_slug: tplSlug,
        dept_ids: templates.find((x) => x.slug === tplSlug)?.dept_ids,
      });
      if (line.operation_id) {
        setProgress(t("solo.lines.new.progress"));
        try {
          await waitForOperation(line.operation_id);
        } catch (e) {
          toast.error(apiErrorMessage(e, t("solo.lines.new.progress-warn")));
        }
      }
      toast.success(t("solo.lines.new.success", { name: name.trim() }));
      navigate(`/solo/l/${line.id}/`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("solo.lines.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <section className="container py-10 max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("solo.lines.new.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("solo.lines.new.subtitle")}</p>
      </header>

      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">
          {t("solo.lines.new.name-label")}
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("solo.lines.new.name-placeholder")}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
        />
      </label>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">
          {t("solo.lines.new.template-label")}
        </div>
        {loadError && (
          <p
            className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion mb-3"
            role="alert"
          >
            {loadError}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((tpl) => (
            <button
              key={tpl.slug}
              type="button"
              onClick={() => setTplSlug(tpl.slug)}
              className={`text-left p-4 rounded border transition-colors ${
                tplSlug === tpl.slug
                  ? "bg-primary/10 border-primary"
                  : "bg-surface border-border-solid hover:border-primary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{tpl.emoji}</span>
                <span className="text-sm text-heading flex-1 truncate">{t(tpl.name_key)}</span>
                <span className="text-[10px] text-muted shrink-0">
                  {tpl.dept_ids.length}
                  {t("solo.overview.lines.teams-suffix")}
                </span>
              </div>
              <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{t(tpl.desc_key)}</p>
              {tpl.monthly_output_estimate != null && tpl.hours_saved_estimate != null && (
                <p className="text-[10px] text-dim mt-2">
                  {t("solo.lines.new.template-meta", {
                    count: tpl.dept_ids.length,
                    output: tpl.monthly_output_estimate,
                    hours: tpl.hours_saved_estimate,
                  })}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <p className="text-xs text-muted" role="status">
          {progress}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button
          type="button"
          onClick={() => navigate("/solo/overview")}
          className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || !tplSlug || submitting}
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
        >
          {submitting ? t("solo.lines.new.submitting") : t("solo.lines.new.submit")}
        </button>
      </div>
    </section>
  );
}
