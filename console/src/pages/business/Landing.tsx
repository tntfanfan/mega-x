import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function BusinessLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 relative overflow-hidden">
      <div className="relative z-10 space-y-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
          🏢 {t("shell.nav.business")}
        </span>
        <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("business.landing.eyebrow")}</p>
        <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
          {t("business.landing.headline")}
        </h1>
        <p className="text-body max-w-2xl">{t("business.landing.body")}</p>
        <div className="pt-4 flex gap-3">
          <Link
            to="/business/overview"
            className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
          >
            {t("business.landing.cta.enter")}
          </Link>
          <a
            href="https://mega-x.ai/phyntom-x8/"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border-solid px-5 py-2 text-sm text-body hover:text-primary hover:border-primary transition"
          >
            {t("business.landing.cta.product")}
          </a>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute -end-6 top-6 text-[14rem] leading-none opacity-[0.05] select-none">🏢</div>
    </section>
  );
}
