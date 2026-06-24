import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function SoloLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 relative overflow-hidden">
      <div className="relative z-10 space-y-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/40 bg-ai/10 px-3 py-1 text-xs text-ai">
          👤 {t("shell.nav.solo")}
        </span>
        <p className="text-xs tracking-[0.3em] text-ai uppercase">{t("solo.landing.eyebrow")}</p>
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
      </div>
      <div aria-hidden className="pointer-events-none absolute -end-6 top-6 text-[14rem] leading-none opacity-[0.05] select-none">👤</div>
    </section>
  );
}
