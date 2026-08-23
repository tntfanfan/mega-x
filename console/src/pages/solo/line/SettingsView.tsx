import { useCallback, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { line: Company };

export default function SettingsView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const onDelete = useCallback(async () => {
    if (!window.confirm(t("solo.line.settings.delete-confirm", { name: line.name }))) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/lines/${line.id}`);
      toast.info(t("solo.line.settings.deleted"));
      navigate("/solo/lines");
    } catch (err) {
      toast.error(apiErrorMessage(err, t("solo.line.settings.delete-error")));
      setDeleting(false);
    }
  }, [line.id, line.name, t, toast, navigate]);

  return (
    <section className="p-6 space-y-6 max-w-5xl">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("solo.line.settings.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("solo.line.settings.subtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("solo.line.settings.status")}
          </div>
          <div className="mt-2 text-lg text-heading">
            {t(`solo.overview.lines.state.${line.state}`)}
          </div>
        </div>
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("solo.line.settings.team-count")}
          </div>
          <div className="mt-2 text-lg text-heading">{line.dept_ids.length}</div>
        </div>
        <div className="rounded-md border border-border-solid bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">
            {t("solo.line.settings.token-30d")}
          </div>
          <div className="mt-2 text-lg text-heading">
            {line.token_usage_30d.toLocaleString()}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-border-solid bg-surface p-4">
        <h2 className="font-display text-lg text-heading">
          {t("solo.line.settings.workspace-title")}
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("solo.line.settings.name")}</dt>
            <dd className="mt-1 text-body">{line.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("solo.line.settings.template")}</dt>
            <dd className="mt-1 text-body">
              {t(`solo.lines.new.tpl.${line.template_slug}.name`, {
                defaultValue: line.template_slug,
              })}
            </dd>
          </div>
        </dl>
      </section>

      <details className="rounded-md border border-border-solid bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-body hover:text-primary">
          {t("solo.line.settings.advanced-title")}
        </summary>
        <dl className="grid gap-4 border-t border-border-solid px-4 py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("solo.line.settings.line-id")}</dt>
            <dd className="mt-1 break-all font-mono text-body">{line.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">{t("solo.line.settings.gateway-port")}</dt>
            <dd className="mt-1 font-mono text-body">{line.gateway_port ?? "—"}</dd>
          </div>
        </dl>
      </details>

      <section className="rounded-md border border-fusion/40 bg-fusion/5 p-4 space-y-2">
        <h2 className="text-sm font-medium text-fusion">{t("solo.line.settings.danger-title")}</h2>
        <p className="text-sm text-muted">{t("solo.line.settings.danger-hint")}</p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md border border-fusion/50 text-fusion px-4 py-1.5 text-sm hover:bg-fusion/10 transition disabled:opacity-50"
        >
          {t("solo.line.settings.delete")}
        </button>
      </section>
    </section>
  );
}
