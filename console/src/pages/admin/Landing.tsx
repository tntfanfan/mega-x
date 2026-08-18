import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type GitSync = {
  status?: string;
  pending_push?: boolean;
  git_available?: boolean;
  last_commit?: string | null;
  last_commit_message?: string | null;
  last_ok_at?: string | null;
  last_error?: string | null;
  retries?: number;
};

type LagResponse = { items?: unknown[]; count?: number };

export default function AdminLanding() {
  const { t } = useTranslation();
  const [sync, setSync] = useState<GitSync | null>(null);
  const [lagCount, setLagCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, lag] = await Promise.all([
          api.get<GitSync>("/v1/admin/git_sync"),
          api.get<LagResponse>("/v1/admin/tenants/lag"),
        ]);
        if (cancelled) return;
        setSync(s);
        setLagCount(lag.count ?? lag.items?.length ?? 0);
      } catch {
        if (!cancelled) {
          setSync(null);
          setLagCount(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncLabel = sync?.git_available === false
    ? t("admin.landing.git-sync.no-git")
    : sync?.pending_push
      ? t("admin.landing.git-sync.pending")
      : (sync?.status || "idle");

  return (
    <section className="container py-20 relative overflow-hidden">
      <div className="relative z-10 space-y-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fusion/40 bg-fusion/10 px-3 py-1 text-xs text-fusion">
          🛡 {t("shell.nav.admin")}
        </span>
        <p className="text-xs tracking-[0.3em] text-fusion uppercase">{t("admin.landing.eyebrow")}</p>
        <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
          {t("admin.landing.headline")}
        </h1>
        <p className="text-body max-w-2xl">{t("admin.landing.body")}</p>
        <div className="pt-4 flex flex-wrap gap-3">
          <Link
            to="/admin/review-queue"
            className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
          >
            {t("admin.landing.cta.review-queue")}
          </Link>
          <Link
            to="/admin/templates"
            className="rounded-md border border-border-solid px-5 py-2 text-sm font-medium text-body hover:border-primary hover:text-primary transition"
          >
            {t("admin.landing.cta.templates")}
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 max-w-3xl">
          <div className="rounded-lg border border-border-solid bg-bg/40 p-4 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted mb-1">
              {t("admin.landing.git-sync.title")}
            </p>
            <p className="text-heading font-medium">{syncLabel}</p>
            {sync?.last_commit_message ? (
              <p className="text-body mt-1 truncate">{sync.last_commit_message}</p>
            ) : null}
            {sync?.last_error ? (
              <p className="text-primary mt-1 text-xs">{sync.last_error}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border-solid bg-bg/40 p-4 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted mb-1">
              {t("admin.landing.lag.title")}
            </p>
            <p className="text-heading font-medium">
              {lagCount == null
                ? "—"
                : t("admin.landing.lag.count", { count: lagCount })}
            </p>
            <p className="text-body mt-1">{t("admin.landing.lag.hint")}</p>
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute -end-6 top-6 text-[14rem] leading-none opacity-[0.05] select-none">🛡</div>
    </section>
  );
}
