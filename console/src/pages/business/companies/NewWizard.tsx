import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

// Template names/descriptions are looked up via i18n keys derived from `slug`
// (business.companies.new.tpl.<slug>.name / .desc).
const TEMPLATES = [
  { slug: "mega-x-default", emoji: "🏢", depts: 21 },
  { slug: "game-studio", emoji: "🎮", depts: 8 },
  { slug: "mcn-content-machine", emoji: "🎬", depts: 6 },
  { slug: "fintech-research", emoji: "📊", depts: 10 },
  { slug: "solo-assistant", emoji: "👤", depts: 3 },
  { slug: "law-firm", emoji: "⚖️", depts: 5 },
];

export default function NewWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState(TEMPLATES[0].slug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const c = await api.post<{ id: string }>("/v1/companies", { name, template_slug: tplSlug });
      toast.success(t("business.companies.new.success", { name: name.trim() }));
      navigate(`/business/c/${c.id}/`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("business.companies.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
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
        <div className="grid sm:grid-cols-2 gap-3">
          {TEMPLATES.map((tpl) => (
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
                <span className="text-[10px] text-muted ms-auto">{tpl.depts}{t("business.overview.company.depts-suffix")}</span>
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

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button onClick={() => navigate("/business/")} className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary">{t("common.cancel")}</button>
        <button onClick={submit} disabled={!name.trim() || submitting} className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50">
          {submitting ? t("business.companies.new.submitting") : t("business.companies.new.submit")}
        </button>
      </div>
    </section>
  );
}
