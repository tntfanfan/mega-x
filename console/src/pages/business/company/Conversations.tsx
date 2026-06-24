import { useTranslation } from "react-i18next";

import { ComingSoon } from "../../../components/ui/ComingSoon";

export default function Conversations() {
  const { t } = useTranslation();
  return (
    <section className="p-6">
      <ComingSoon
        title={t("business.company.conversations.title")}
        description={t("business.company.conversations.subtitle")}
        stage="S8"
        planned={[
          t("business.company.conversations.plan.grouped"),
          t("business.company.conversations.plan.history"),
          t("business.company.conversations.plan.live"),
        ]}
      />
    </section>
  );
}
