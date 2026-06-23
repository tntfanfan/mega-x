import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function DevLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("dev.landing.eyebrow")}</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        {t("dev.landing.headline")}
      </h1>
      <p className="text-body max-w-2xl">
        {t("dev.landing.body.prefix")}
        <span className="text-primary">{t("dev.landing.body.split")}</span>
        {t("dev.landing.body.suffix")}
      </p>
      <div className="pt-4">
        <Link
          to="/dev/home"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("dev.landing.cta.dev-home")}
        </Link>
      </div>
    </section>
  );
}
