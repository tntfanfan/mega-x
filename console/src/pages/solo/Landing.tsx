/**
 * /solo/ — Solo 营销 Hero（重写：one-person unicorn 叙事）.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function SoloLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-16 space-y-8">
      <header className="space-y-3">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("solo.landing.eyebrow")}</p>
        <h1 className="text-4xl md:text-5xl font-display text-heading leading-tight max-w-3xl">
          {t("solo.landing.headline.line1")}<br />
          <span className="text-primary">{t("solo.landing.headline.line2")}</span>
        </h1>
        <p className="text-body max-w-2xl leading-relaxed">{t("solo.landing.body")}</p>
      </header>

      <ul className="grid sm:grid-cols-2 gap-3 max-w-3xl">
        {[1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="rounded-md border border-border-solid bg-surface p-3 text-sm text-body"
          >
            {t(`solo.landing.bullet.${i}`)}
          </li>
        ))}
      </ul>

      <div className="pt-2 flex flex-wrap gap-3">
        <Link
          to="/solo/overview"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          {t("solo.landing.cta.start")}
        </Link>
        <Link
          to="/solo/lines/new"
          className="rounded-md border border-border-solid px-5 py-2 text-sm text-body hover:text-primary hover:border-primary transition"
        >
          {t("solo.landing.cta.learn")}
        </Link>
      </div>
    </section>
  );
}
