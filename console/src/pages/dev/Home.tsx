import { useTranslation } from "react-i18next";

import { ComingSoon } from "../../components/ui/ComingSoon";

export default function DevHome() {
  const { t } = useTranslation();
  return (
    <section className="container py-10">
      <ComingSoon
        title={t("dev.home.title")}
        stage="S4"
        planned={["MyDepts", "CreateWizard", "WebIDE", "Submit", "Analytics", "Earnings", "Payouts"]}
      />
    </section>
  );
}
