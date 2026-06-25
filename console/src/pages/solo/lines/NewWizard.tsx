/**
 * /solo/lines/new — 新建产线 Wizard。
 *
 * 步骤 1：起个名字（"我的 newsletter"）
 * 步骤 2：选模板（6 个收入向模板）
 * 提交后 → /solo/l/:newId/
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import type { LineTemplate } from "../../../lib/fixtures";

export default function SoloNewWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<LineTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ items: LineTemplate[] }>("/v1/lines/templates").then((r) => {
      setTemplates(r.items);
      if (r.items.length > 0) setTplSlug(r.items[0].slug);
    });
  }, []);

  const submit = async () => {
    if (!tplSlug) return;
    setSubmitting(true);
    setError(null);
    try {
      const line = await api.post<Company>("/v1/lines", { name: name.trim(), template_slug: tplSlug });
      navigate(`/solo/l/${line.id}/`);
    } catch (e) {
      console.error(e);
      setError(t("solo.lines.new.error"));
      setSubmitting(false);
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
              </div>
              <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{t(tpl.desc_key)}</p>
              <p className="text-[10px] text-dim mt-2">
                {t("solo.lines.new.template-meta", {
                  count: tpl.dept_ids.length,
                  output: tpl.monthly_output_estimate,
                  hours: tpl.hours_saved_estimate,
                })}
              </p>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion">
          {error}
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
          onClick={submit}
          disabled={!name.trim() || !tplSlug || submitting}
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
        >
          {submitting ? t("solo.lines.new.submitting") : t("solo.lines.new.submit")}
        </button>
      </div>
    </section>
  );
}
