import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Company } from "../../../lib/api";

type Ctx = { company: Company };

export default function Settings() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
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
      <p className="text-xs text-muted pt-4 border-t border-border-solid">{t("business.company.settings.footer")}</p>
    </section>
  );
}
