import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function SoloLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("solo.landing.eyebrow")}</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        {t("solo.landing.headline")}
      </h1>
      <p className="text-body max-w-2xl">{t("solo.landing.body")}</p>
      <div className="pt-4">
        <Link
          to="/solo/dashboard"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("solo.landing.cta.start")}
        </Link>
      </div>
    </section>
  );
}
