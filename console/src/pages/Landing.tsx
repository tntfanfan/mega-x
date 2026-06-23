import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Landing() {
  const { t } = useTranslation();

  const cards = [
    {
      href: "/business/",
      title: t("landing.card.business.title"),
      line: t("landing.card.business.line"),
      body: t("landing.card.business.body"),
      badge: t("landing.card.business.badge"),
    },
    {
      href: "/solo/",
      title: t("landing.card.solo.title"),
      line: t("landing.card.solo.line"),
      body: t("landing.card.solo.body"),
      badge: t("landing.card.solo.badge"),
    },
    {
      href: "/dev/",
      title: t("landing.card.builders.title"),
      line: t("landing.card.builders.line"),
      body: t("landing.card.builders.body"),
      badge: t("landing.card.builders.badge"),
    },
  ];

  return (
    <section className="container py-20">
      <div className="text-center mb-12 space-y-3">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">{t("landing.eyebrow")}</p>
        <h1 className="text-3xl md:text-5xl font-display text-heading leading-tight">
          {t("landing.headline.line1")}
          <br className="hidden md:block" />
          {t("landing.headline.line2")}
        </h1>
        <p className="text-body max-w-2xl mx-auto">
          {t("landing.subtitle.line1")}
          <br />
          {t("landing.subtitle.line2")}
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            to={c.href}
            className="group rounded-md border border-border-solid bg-surface p-6 hover:border-primary transition-colors"
          >
            <div className="text-xs text-muted">{c.badge}</div>
            <h2 className="font-display text-2xl mt-2 group-hover:text-primary">{c.title}</h2>
            <p className="text-primary mt-2 text-sm">{c.line}</p>
            <p className="text-body mt-4 text-sm leading-relaxed">{c.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
