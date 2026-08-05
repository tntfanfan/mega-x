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
      <header>
        <h2 className="font-display text-xl text-heading">{t("solo.line.settings.title")}</h2>
      </header>
      <dl className="text-sm space-y-2">
        <Row label={t("solo.line.settings.name")} value={line.name} />
        <Row label={t("solo.line.settings.template")} value={line.template_slug} mono />
        <Row label={t("solo.line.settings.state")} value={line.state} mono />
      </dl>
      <div className="pt-4 border-t border-border-solid space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-fusion">
          {t("solo.line.settings.danger-title")}
        </h3>
        <p className="text-xs text-muted">{t("solo.line.settings.danger-hint")}</p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md border border-fusion/50 text-fusion px-4 py-1.5 text-sm hover:bg-fusion/10 transition disabled:opacity-50"
        >
          {deleting ? t("solo.line.settings.deleting") : t("solo.line.settings.delete")}
        </button>
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex">
      <dt className="text-muted text-xs uppercase tracking-widest w-32 shrink-0">{label}</dt>
      <dd className={`text-body ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
