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
    <section className="p-6 space-y-4">
      <h1 className="font-display text-2xl text-heading">{t("business.company.settings.title")}</h1>
      <dl className="text-sm space-y-2">
        <div><dt className="text-muted text-xs uppercase tracking-widest">{t("business.company.settings.name")}</dt><dd className="text-body">{company.name}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">{t("business.company.settings.template")}</dt><dd className="text-body font-mono">{company.template_slug}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">{t("business.company.settings.gateway-port")}</dt><dd className="text-body font-mono">{company.gateway_port}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">{t("business.company.settings.dept-count")}</dt><dd className="text-body">{company.dept_ids.length}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">{t("business.company.settings.token-30d")}</dt><dd className="text-body">{company.token_usage_30d.toLocaleString()}</dd></div>
      </dl>
      <div className="pt-4 border-t border-border-solid space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-fusion">{t("business.company.settings.danger-title")}</h2>
        <p className="text-xs text-muted">{t("business.company.settings.danger-hint")}</p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md border border-fusion/50 text-fusion px-4 py-1.5 text-sm hover:bg-fusion/10 transition disabled:opacity-50"
        >
          {t("business.company.settings.delete")}
        </button>
      </div>
      <p className="text-xs text-muted pt-4 border-t border-border-solid">{t("business.company.settings.footer")}</p>
    </section>
  );
}
