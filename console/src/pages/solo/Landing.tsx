/**
 * /solo/ — Solo marketing hero (one-person unicorn narrative).
 * Layout mirrors business Landing; copy stays solo-specific.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function SoloLanding() {
  const { t } = useTranslation();
  return (
    <section className="container py-20 relative overflow-hidden">
      <div className="relative z-10 space-y-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
          🚀 {t("shell.nav.solo")}
        </span>
        <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("solo.landing.eyebrow")}</p>
        <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl leading-tight">
          {t("solo.landing.headline.line1")}
          <br />
          <span className="text-primary">{t("solo.landing.headline.line2")}</span>
        </h1>
        <p className="text-body max-w-2xl">{t("solo.landing.body")}</p>

        <ul className="grid sm:grid-cols-2 gap-3 max-w-3xl pt-2">
          {[1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="rounded-md border border-border-solid bg-surface/60 p-3 text-sm text-body"
            >
              {t(`solo.landing.bullet.${i}`)}
            </li>
          ))}
        </ul>

        <div className="pt-4 flex gap-3 flex-wrap">
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
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -end-6 top-6 text-[14rem] leading-none opacity-[0.05] select-none"
      >
        🚀
      </div>
    </section>
  );
}
