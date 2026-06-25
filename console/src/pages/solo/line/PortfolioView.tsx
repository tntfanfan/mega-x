/**
 * /solo/l/:lineId/portfolio — 该产线产出的所有作品。
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, Artifact } from "../../../lib/api";
import { lookupGroupLabel } from "../../../lib/fixtures";
import { PortfolioTile } from "../../../components/solo/PortfolioTile";

type Ctx = { line: Company };

export default function PortfolioView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [items, setItems] = useState<Artifact[]>([]);
  const [active, setActive] = useState<Artifact | null>(null);

  useEffect(() => {
    api.get<{ items: Artifact[] }>(`/v1/lines/${line.id}/artifacts`).then((r) => setItems(r.items));
  }, [line.id]);

  return (
    <section className="p-6 space-y-6">
      <header>
        <h2 className="font-display text-xl text-heading">{t("solo.line.portfolio.title")}</h2>
        <p className="text-sm text-muted">{t("solo.line.portfolio.subtitle")}</p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("solo.line.portfolio.empty")}</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items
            .slice()
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
            .map((a) => {
              const labels = lookupGroupLabel(line.template_slug, a.dept_id);
              const groupLabel = labels ? t(labels.label_key) : a.dept_id;
              return (
                <PortfolioTile
                  key={a.id}
                  artifact={a}
                  groupLabel={groupLabel}
                  onClick={() => setActive(a)}
                />
              );
            })}
        </div>
      )}

      {active && <Preview art={active} onClose={() => setActive(null)} />}
    </section>
  );
}

function Preview({ art, onClose }: { art: Artifact; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-surface border border-border-solid rounded-md max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-border-solid flex items-center justify-between">
          <div>
            <div className="text-sm text-heading">{art.name}</div>
            <div className="text-[11px] text-muted">{art.type}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-6 text-sm text-body">
          {art.preview_text ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{art.preview_text}</pre>
          ) : art.thumbnail_url ? (
            <img src={art.thumbnail_url} alt={art.name} className="max-w-full" />
          ) : (
            <p className="text-muted">无预览，请下载。</p>
          )}
        </div>
      </div>
    </div>
  );
}
