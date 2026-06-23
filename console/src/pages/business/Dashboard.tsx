import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type DeptCard, type Me } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const { me, loading: meLoading } = useAuth();
  const [depts, setDepts] = useState<DeptCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: DeptCard[]; total: number }>("/v1/depts")
      .then((res) => setDepts(res.items))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <section className="container py-10 space-y-8">
      <header className="space-y-1">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("business.dashboard.eyebrow")}</p>
        <h1 className="font-display text-3xl text-heading">{t("business.dashboard.title")}</h1>
      </header>

      <MeBlock me={me} loading={meLoading} />
      <DeptsBlock depts={depts} error={error} />
    </section>
  );
}

function MeBlock({ me, loading }: { me: Me | null; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border-solid bg-surface p-5">
      <h2 className="text-muted text-xs uppercase tracking-widest mb-3">
        {t("business.dashboard.me-block.title")}
      </h2>
      {loading ? (
        <p className="text-body text-sm">{t("business.dashboard.loading")}</p>
      ) : me ? (
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <dt className="text-muted">{t("business.dashboard.user")}</dt>
          <dd className="text-body">
            {me.user.display_name} <span className="text-muted">({me.user.email})</span>
          </dd>
          <dt className="text-muted">{t("business.dashboard.roles")}</dt>
          <dd className="text-body">{me.roles.join(", ")}</dd>
          <dt className="text-muted">{t("business.dashboard.tenants")}</dt>
          <dd className="text-body">{me.tenants.map((tn) => tn.name).join(", ")}</dd>
        </dl>
      ) : (
        <p className="text-fusion text-sm">{t("business.dashboard.not-logged-in")}</p>
      )}
    </div>
  );
}

function DeptsBlock({ depts, error }: { depts: DeptCard[] | null; error: string | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-muted text-xs uppercase tracking-widest mb-3">
        {t("business.dashboard.depts-title.prefix")}
        {depts?.length ?? t("business.dashboard.depts-loading-suffix")}
      </h2>
      {error && <p className="text-fusion text-sm">{error}</p>}
      {depts && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {depts.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-border-solid bg-surface p-4 hover:border-primary transition"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg text-heading">{d.id}</h3>
                <span
                  className={
                    "text-[10px] tracking-widest uppercase px-2 py-0.5 rounded " +
                    (d.source_type === "builtin"
                      ? "bg-primary/10 text-primary"
                      : "bg-ai/10 text-ai")
                  }
                >
                  {d.source_type}
                </span>
              </div>
              <p className="text-body text-sm mt-1">{d.name}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span>{t("business.dashboard.dept.agents", { count: d.role_count })}</span>
                <span className="text-heading">·</span>
                <Tier label={t("business.dashboard.tier.high")} n={d.tier_breakdown.HIGH} />
                <Tier label={t("business.dashboard.tier.medium")} n={d.tier_breakdown.MEDIUM} />
                <Tier label={t("business.dashboard.tier.low")} n={d.tier_breakdown.LOW} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tier({ label, n }: { label: string; n: number }) {
  if (!n) return null;
  return (
    <span className="text-muted">
      {label}: <span className="text-body">{n}</span>
    </span>
  );
}
