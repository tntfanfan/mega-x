import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/ui/Toast";

type EditBadge = {
  state: string;
  editor_user_id: string;
  updated_at?: string;
  base_commit?: string | null;
  applied_commit?: string | null;
};

type TemplateCard = {
  id: string;
  name: string;
  emoji: string;
  short_desc: string;
  category?: string;
  role_count?: number;
  edit: EditBadge | null;
};

const STATE_CLASS: Record<string, string> = {
  editing: "border-spark-flare/40 text-spark-flare bg-spark-flare/10",
  applying: "border-spark-blue/40 text-spark-blue bg-spark-blue/10",
  applied: "border-spark-mint/40 text-spark-mint bg-spark-mint/10",
  apply_failed: "border-fusion/40 text-fusion bg-fusion/10",
};

export default function AdminTemplates() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { me } = useAuth();
  const uid = me?.user.id;
  const [items, setItems] = useState<TemplateCard[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: TemplateCard[] }>("/v1/admin/templates");
      setItems(res.items || []);
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.load-failed")));
      setItems([]);
    }
  }, [toast, t]);

  useEffect(() => { void load(); }, [load]);

  const openStudio = async (card: TemplateCard) => {
    setBusyId(card.id);
    try {
      if (card.edit && uid && card.edit.editor_user_id !== uid) {
        toast.error(t("admin.templates.occupied", { editor: card.edit.editor_user_id }));
        return;
      }
      await api.post(`/v1/admin/templates/${card.id}/edit?reuse=true`);
      navigate(`/admin/templates/${card.id}/studio`);
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.edit-failed")));
    } finally {
      setBusyId(null);
    }
  };

  const discard = async (card: TemplateCard) => {
    if (!window.confirm(t("admin.templates.discard-confirm", { name: card.name }))) return;
    setBusyId(card.id);
    try {
      await api.delete(`/v1/admin/templates/${card.id}/edit`);
      toast.info(t("admin.templates.discarded"));
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e, t("admin.templates.discard-failed")));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="container py-12">
      <div className="mb-8">
        <Link to="/admin/" className="text-xs text-muted hover:text-primary">
          {t("admin.templates.back")}
        </Link>
        <h1 className="mt-3 font-display text-3xl text-heading">{t("admin.templates.title")}</h1>
        <p className="mt-2 text-body max-w-2xl">{t("admin.templates.subtitle")}</p>
      </div>
      {items == null ? (
        <p className="text-sm text-muted">{t("common.loading")}…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((card) => {
            const mine = card.edit && card.edit.editor_user_id === uid;
            const badge = card.edit?.state;
            return (
              <article
                key={card.id}
                className="rounded-lg border border-border-solid bg-surface/40 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{card.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-heading truncate">{card.name}</h2>
                    <p className="text-[11px] font-mono text-muted">{card.id}</p>
                    <p className="text-xs text-body mt-1 line-clamp-2">{card.short_desc}</p>
                  </div>
                </div>
                {badge && (
                  <div className={`self-start rounded-full border px-2 py-0.5 text-[10px] ${STATE_CLASS[badge] || "text-muted"}`}>
                    {t(`admin.templates.state.${badge}`, { defaultValue: badge })}
                    {card.edit && !mine ? ` · ${card.edit.editor_user_id}` : ""}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === card.id || (!!card.edit && !mine)}
                    onClick={() => { void openStudio(card); }}
                    className="rounded-md bg-primary text-bg px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {mine ? t("admin.templates.continue") : t("admin.templates.edit")}
                  </button>
                  {mine && (
                    <button
                      type="button"
                      disabled={busyId === card.id}
                      onClick={() => { void discard(card); }}
                      className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-fusion hover:text-fusion"
                    >
                      {t("admin.templates.discard")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
