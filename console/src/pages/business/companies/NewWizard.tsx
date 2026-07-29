import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

/** Shape of GET /v1/templates items (R1). */
interface CompanyTemplate {
  slug: string;
  emoji: string;
  name_key: string;
  desc_key: string;
  dept_ids: string[];
}

interface CreateCompanyResp {
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

export default function NewWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: CompanyTemplate[] }>("/v1/templates")
      .then((r) => {
        if (cancelled) return;
        setTemplates(r.items);
        if (r.items.length > 0) setTplSlug(r.items[0].slug);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(apiErrorMessage(e, t("business.companies.new.error")));
      });
    return () => { cancelled = true; };
  }, [t]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setProgress(null);
    try {
      const c = await api.post<CreateCompanyResp>("/v1/companies", {
        name,
        template_slug: tplSlug,
        dept_ids: templates.find((x) => x.slug === tplSlug)?.dept_ids,
      });
      if (c.operation_id) {
        setProgress("供给中（首启可能需要数分钟）…");
        try {
          await waitForOperation(c.operation_id);
        } catch (e) {
          // Still navigate — user can watch status on company page
          toast.error(apiErrorMessage(e, "供给未完成，可稍后在公司页查看状态"));
        }
      }
      toast.success(t("business.companies.new.success", { name: name.trim() }));
      navigate(`/business/c/${c.id}/`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("business.companies.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <section className="container py-10 max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("business.companies.new.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("business.companies.new.subtitle")}</p>
      </header>

      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{t("business.companies.new.name-label")}</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("business.companies.new.name-placeholder")}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
        />
      </label>

      <div className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-2">{t("business.companies.new.template-label")}</div>
        {loadError && (
          <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion mb-3" role="alert">
            {loadError}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((tpl) => (
            <button
              key={tpl.slug}
              type="button"
              onClick={() => setTplSlug(tpl.slug)}
              className={`text-start p-4 rounded border transition-colors ${
                tplSlug === tpl.slug
                  ? "bg-primary/10 border-primary"
                  : "bg-surface border-border-solid hover:border-primary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{tpl.emoji}</span>
                <span className="text-sm text-heading">{t(`business.companies.new.tpl.${tpl.slug}.name`)}</span>
                <span className="text-[10px] text-muted ms-auto">{tpl.dept_ids.length}{t("business.overview.company.depts-suffix")}</span>
              </div>
              <p className="text-[11px] text-muted mt-1">{t(`business.companies.new.tpl.${tpl.slug}.desc`)}</p>
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
        <p className="text-xs text-muted" role="status">{progress}</p>
      )}

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button onClick={() => navigate("/business/overview")} className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary">{t("common.cancel")}</button>
        <button onClick={submit} disabled={!name.trim() || !tplSlug || submitting} className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50">
          {submitting ? t("business.companies.new.submitting") : t("business.companies.new.submit")}
        </button>
      </div>
    </section>
  );
}
