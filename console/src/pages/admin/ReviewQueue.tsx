import { useTranslation } from "react-i18next";

import { ComingSoon } from "../../components/ui/ComingSoon";

export default function AdminReviewQueue() {
  const { t } = useTranslation();
  return (
    <section className="container py-10">
      <ComingSoon
        title={t("admin.review-queue.title")}
        stage="S5"
        planned={["Source Diff", "Auto Scan", "Manual Review", "Test Run"]}
      />
    </section>
  );
}
