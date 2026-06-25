import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Company } from "../../../lib/api";

type Ctx = { line: Company };

export default function SettingsView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
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
      <div className="flex gap-2 pt-4 border-t border-border-solid">
        <button className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:text-primary hover:border-primary">
          {line.state === "running" ? t("solo.line.settings.pause") : t("solo.line.settings.resume")}
        </button>
        <button className="rounded-md border border-fusion/40 px-3 py-1.5 text-xs text-fusion hover:bg-fusion/10">
          {t("solo.line.settings.delete")}
        </button>
      </div>
      <p className="text-xs text-muted pt-4 border-t border-border-solid">{t("solo.line.settings.placeholder")}</p>
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
