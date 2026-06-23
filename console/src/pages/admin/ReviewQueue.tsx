import { useTranslation } from "react-i18next";

export default function AdminReviewQueue() {
  const { t } = useTranslation();
  return (
    <section className="container py-10 space-y-4">
      <h1 className="font-display text-3xl text-heading">{t("admin.review-queue.title")}</h1>
      <p className="text-body text-sm">{t("admin.review-queue.subtitle")}</p>
      <div className="rounded-md border border-border-solid bg-surface p-5 text-sm text-muted">
        {t("admin.review-queue.placeholder")}
      </div>
    </section>
  );
}
