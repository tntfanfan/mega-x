/**
 * /dev/home — MyDepts gallery (For Builders). Lists the builder's departments
 * (draft / in-review / published) and links into the Studio. v0 mock-driven.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../lib/api";
import type { DraftCard } from "../../lib/builderFixtures";
import { useToast } from "../../components/ui/Toast";
import { CardGridSkeleton } from "../../components/ui/Skeleton";

const STATE_COLOR: Record<string, string> = {
  draft: "text-spark-flare",
  in_review: "text-spark-blue",
  published: "text-spark-mint",
};

export default function DevHome() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DraftCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: DraftCard[] }>("/v1/dev/depts")
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("dev.mydepts.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, t]);

  return (
    <section className="container py-10 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-heading">{t("dev.mydepts.title")}</h1>
          <p className="text-sm text-muted mt-1">{t("dev.mydepts.subtitle")}</p>
        </div>
        <Link to="/dev/depts/new/studio" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent transition shrink-0">
          {t("dev.mydepts.new")}
        </Link>
      </header>

      {loading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((d) => (
            <Link
              key={d.id}
              to={`/dev/depts/${d.id}/studio`}
              className="group rounded-md border border-border-solid bg-surface p-5 hover:border-primary transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">{d.emoji}</span>
                <span className={`text-[11px] ${STATE_COLOR[d.state] ?? "text-muted"}`}>{t(`dev.dept.state.${d.state}`)}</span>
              </div>
              <h3 className="font-display text-lg text-heading mt-2 group-hover:text-primary">{d.name}</h3>
              <p className="text-[11px] text-muted mt-1 line-clamp-2">{d.mission}</p>
              <div className="mt-4 pt-3 border-t border-border-solid flex items-center justify-between text-[11px] text-muted">
                <span>{t("dev.mydepts.installs", { count: d.install_count })}</span>
                <span>{t("dev.mydepts.earnings", { amount: d.earnings_30d.toLocaleString() })}</span>
              </div>
              <span className="mt-2 text-xs text-primary group-hover:underline self-start">{t("dev.mydepts.open-studio")}</span>
            </Link>
          ))}
          <Link
            to="/dev/depts/new/studio"
            className="rounded-md border border-dashed border-border-solid bg-surface/40 p-5 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-surface/80 transition-colors min-h-[160px]"
          >
            <div className="text-3xl text-primary opacity-70">＋</div>
            <h3 className="font-display text-base text-heading mt-2">{t("dev.mydepts.new")}</h3>
          </Link>
        </div>
      )}
    </section>
  );
}
