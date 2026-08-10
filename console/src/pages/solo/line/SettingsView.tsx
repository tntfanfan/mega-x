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
      navigate("/solo/overview");
    } catch (err) {
      toast.error(apiErrorMessage(err, t("solo.line.settings.delete-error")));
      setDeleting(false);
    }
  }, [line.id, line.name, t, toast, navigate]);

  return (
    <section className="p-6 space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl text-heading">{t("solo.line.settings.title")}</h1>
      <dl className="text-sm space-y-2">
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.name")}</dt>
          <dd className="text-body">{line.name}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.template")}</dt>
          <dd className="text-body font-mono">{line.template_slug}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.state")}</dt>
          <dd className="text-body font-mono">{line.state}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.gateway-port")}</dt>
          <dd className="text-body font-mono">{line.gateway_port ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.team-count")}</dt>
          <dd className="text-body">{line.dept_ids.length}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-widest">{t("solo.line.settings.token-30d")}</dt>
          <dd className="text-body">{line.token_usage_30d.toLocaleString()}</dd>
        </div>
      </dl>
      <div className="pt-4 border-t border-border-solid space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-fusion">
          {t("solo.line.settings.danger-title")}
        </h2>
        <p className="text-xs text-muted">{t("solo.line.settings.danger-hint")}</p>
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={deleting}
          className="rounded-md border border-fusion/50 text-fusion px-4 py-1.5 text-sm hover:bg-fusion/10 transition disabled:opacity-50"
        >
          {deleting ? t("solo.line.settings.deleting") : t("solo.line.settings.delete")}
        </button>
      </div>
      <p className="text-xs text-muted pt-4 border-t border-border-solid">
        {t("solo.line.settings.footer")}
      </p>
    </section>
  );
}
