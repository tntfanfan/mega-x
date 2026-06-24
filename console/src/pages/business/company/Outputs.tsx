/**
 * /business/c/:companyId/outputs — Artifact gallery.
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, Artifact, ArtifactType } from "../../../lib/api";

type Ctx = { company: Company };

const TYPE_ICON: Record<ArtifactType, string> = {
  markdown: "📄", code: "📑", json: "📑",
  image: "🖼", video: "🎬", audio: "🎵",
  table: "📊", pdf: "📕",
};

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export default function Outputs() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [items, setItems] = useState<Artifact[]>([]);
  const [active, setActive] = useState<Artifact | null>(null);

  useEffect(() => {
    api.get<{ items: Artifact[] }>(`/v1/companies/${company.id}/artifacts`).then((r) => setItems(r.items));
  }, [company.id]);

  return (
    <section className="p-6 space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("business.company.outputs.title")}</h1>
        <p className="text-sm text-muted">{t("business.company.outputs.subtitle")}</p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("business.company.outputs.empty")}</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActive(a)}
              className="rounded-md border border-border-solid bg-surface p-4 text-left hover:border-primary transition-colors"
            >
              <div className="text-3xl">{TYPE_ICON[a.type] ?? "📦"}</div>
              <div className="mt-2 text-sm text-heading truncate">{a.name}</div>
              <div className="text-[11px] text-muted">{a.dept_id} · {fmtSize(a.size_bytes)}</div>
            </button>
          ))}
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
            <div className="text-[11px] text-muted">{art.type} · {fmtSize(art.size_bytes)}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-6 text-sm text-body">
          {art.preview_text ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{art.preview_text}</pre>
          ) : art.thumbnail_url ? (
            <img src={art.thumbnail_url} alt={art.name} className="max-w-full" />
          ) : (
            <p className="text-muted">无预览，请下载查看。</p>
          )}
        </div>
        <footer className="px-4 py-3 border-t border-border-solid flex gap-2">
          <button className="rounded-md bg-primary text-bg px-4 py-1.5 text-xs font-medium">下载</button>
          <button className="rounded-md border border-border-solid px-4 py-1.5 text-xs text-body hover:text-primary">复制</button>
        </footer>
      </div>
    </div>
  );
}
