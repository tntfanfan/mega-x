/**
 * /solo/l/:lineId/portfolio — 该产线产出的所有作品。
 *
 * Reuses company ArtifactGallery with line-scoped owner + task links.
 */

import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Company } from "../../../lib/api";
import { ArtifactGallery } from "../../business/company/ArtifactGallery";

type Ctx = { line: Company };

export default function PortfolioView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();

  return (
    <section className="flex flex-col min-h-0 h-[calc(100vh-8rem-72px)]">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 shrink-0">
        <h2 className="font-display text-lg text-heading">{t("solo.line.portfolio.title")}</h2>
        <p className="text-xs text-muted">{t("solo.line.portfolio.subtitle")}</p>
      </header>
      <div className="flex-1 overflow-y-auto min-h-0">
        <ArtifactGallery
          owner={{ kind: "lines", id: line.id }}
          taskBasePath={`/solo/l/${line.id}/tasks`}
          showTaskLink
          emptyTitle={t("solo.line.portfolio.empty")}
          loadErrorKey="solo.line.portfolio.load-error"
          taskLinkKey="solo.line.portfolio.task-link"
        />
      </div>
    </section>
  );
}
