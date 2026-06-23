import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function AdminLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("admin.landing.eyebrow")}</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        {t("admin.landing.headline")}
      </h1>
      <p className="text-body max-w-2xl">{t("admin.landing.body")}</p>
      <div className="pt-4">
        <Link
          to="/admin/review-queue"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("admin.landing.cta.review-queue")}
        </Link>
      </div>
    </section>
  );
}
