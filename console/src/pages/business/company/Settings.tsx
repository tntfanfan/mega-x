import { useCallback, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { company: Company };

export default function Settings() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const onDelete = useCallback(async () => {
    if (!window.confirm(t("business.companies.delete-confirm", { name: company.name }))) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/companies/${company.id}`);
      toast.info(t("business.companies.deleted"));
      navigate("/business/companies");
    } catch (err) {
      toast.error(apiErrorMessage(err, t("business.companies.delete-error")));
      setDeleting(false);
    }
  }, [company.id, company.name, t, toast, navigate]);
  return (
    <section className="p-6 space-y-6 max-w-5xl">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("business.company.settings.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("business.company.settings.subtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("business.company.settings.status")}
          </div>
          <div className="mt-2 text-lg text-heading">
            {t(`business.overview.company.state.${company.state}`)}
          </div>
        </div>
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("business.company.settings.dept-count")}
          </div>
          <div className="mt-2 text-lg text-heading">{company.dept_ids.length}</div>
        </div>
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("business.company.settings.token-30d")}
          </div>
          <div className="mt-2 text-lg text-heading">
            {company.token_usage_30d.toLocaleString()}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-border-solid bg-surface p-4">
        <h2 className="font-display text-lg text-heading">
          {t("business.company.settings.workspace-title")}
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("business.company.settings.name")}</dt>
            <dd className="mt-1 text-body">{company.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("business.company.settings.template")}</dt>
            <dd className="mt-1 text-body">
              {t(`business.companies.new.tpl.${company.template_slug}.name`, {
                defaultValue: company.template_slug,
              })}
            </dd>
          </div>
        </dl>
      </section>

      <details className="rounded-md border border-border-solid bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-body hover:text-primary">
          {t("business.company.settings.advanced-title")}
        </summary>
        <dl className="grid gap-4 border-t border-border-solid px-4 py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("business.company.settings.company-id")}</dt>
            <dd className="mt-1 break-all font-mono text-body">{company.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("business.company.settings.gateway-port")}</dt>
            <dd className="mt-1 font-mono text-body">{company.gateway_port ?? "—"}</dd>
          </div>
        </dl>
      </details>

      <section className="rounded-md border border-fusion/40 bg-fusion/5 p-4 space-y-2">
        <h2 className="text-sm font-medium text-fusion">{t("business.company.settings.danger-title")}</h2>
        <p className="text-sm text-muted">{t("business.company.settings.danger-hint")}</p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md border border-fusion/50 text-fusion px-4 py-1.5 text-sm hover:bg-fusion/10 transition disabled:opacity-50"
        >
          {t("business.company.settings.delete")}
        </button>
      </section>
    </section>
  );
}
