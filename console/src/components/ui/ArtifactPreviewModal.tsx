/**
 * Full-screen artifact viewer modal — click an output card to open.
 * Re-fetches text artifacts for full content (list truncates preview).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../lib/api";
import type { Artifact } from "../../lib/api";
import { copyArtifactText, downloadArtifact, isTextArtifact } from "../../lib/artifacts";
import { useToast } from "./Toast";
import { ArtifactViewer } from "./ArtifactViewer";

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function ArtifactPreviewModal({
  art,
  companyId,
  onClose,
}: {
  art: Artifact;
  companyId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullText, setFullText] = useState<string | null>(art.preview_text ?? null);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isTextArtifact(art)) {
      setFullText(art.preview_text ?? null);
      return;
    }
    let cancelled = false;
    setLoadingText(true);
    setFullText(art.preview_text ?? null);
    api
      .get<Artifact>(`/v1/companies/${companyId}/artifacts/${art.id}`)
      .then((full) => {
        if (cancelled) return;
        if (typeof full.preview_text === "string") {
          setFullText(full.preview_text);
        }
      })
      .catch(() => {
        // keep list preview — fail-open
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [art, companyId]);

  const onDownload = () => {
    const withText = fullText != null ? { ...art, preview_text: fullText } : art;
    const r = downloadArtifact(withText);
    if (r === "started") toast.success(t("common.download-started", { name: art.name }));
    else toast.info(t("common.download-empty"));
  };

  const onCopy = async () => {
    try {
      const withText = fullText != null ? { ...art, preview_text: fullText } : art;
      const ok = await copyArtifactText(withText);
      if (ok) toast.success(t("common.copied"));
      else toast.info(t("common.copy-empty"));
    } catch {
      toast.error(t("common.copy-failed"));
    }
  };

  const wide = art.type === "pdf" || art.type === "video" || art.type === "image";

  return (
    <div
      className="fixed inset-0 bg-bg/80 backdrop-blur flex items-center justify-center z-50 p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={art.name}
    >
      <div
        className={`bg-surface border border-border-solid rounded-md w-full max-h-[90vh] overflow-hidden flex flex-col ${
          wide ? "max-w-4xl" : "max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-solid flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-sm text-heading truncate">{art.name}</div>
            <div className="text-[11px] text-muted">
              {t(`artifact.type.${art.type}`, { defaultValue: art.type })} ·{" "}
              {fmtSize(art.size_bytes)}
              {loadingText ? ` · ${t("common.loading")}…` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary shrink-0 text-lg leading-none px-1"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          <ArtifactViewer art={art} companyId={companyId} textOverride={fullText} />
        </div>
        <footer className="px-4 py-3 border-t border-border-solid flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-md bg-primary text-bg px-4 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            {t("common.download")}
          </button>
          {isTextArtifact(art) && (
            <button
              type="button"
              onClick={() => void onCopy()}
              className="rounded-md border border-border-solid px-4 py-1.5 text-xs text-body hover:text-primary hover:border-primary transition-colors"
            >
              {t("common.copy")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-md border border-border-solid px-4 py-1.5 text-xs text-body hover:text-primary"
          >
            {t("common.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
