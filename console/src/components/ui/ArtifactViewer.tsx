/**
 * Type-aware artifact body — markdown (GFM), code/json, image, audio, video, pdf.
 * Used inline (TaskDetail) and inside ArtifactPreviewModal.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Artifact } from "../../lib/api";
import { artifactMediaUrl, isTextArtifact } from "../../lib/artifacts";
import { Markdown } from "./Markdown";

/** Best-effort CSV/TSV → GFM table; returns null if it doesn't look tabular. */
function csvToMarkdownTable(raw: string): string | null {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const delim = lines[0].includes("\t")
    ? "\t"
    : lines[0].includes(";")
      ? ";"
      : ",";
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim()));
  const width = rows[0].length;
  if (width < 2 || rows.some((r) => r.length !== width)) return null;
  const esc = (c: string) => c.replace(/\|/g, "\\|");
  const header = `| ${rows[0].map(esc).join(" | ")} |`;
  const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
  const body = rows.slice(1).map((r) => `| ${r.map(esc).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

export function ArtifactViewer({
  art,
  companyId,
  textOverride,
  className = "",
}: {
  art: Artifact;
  companyId: string;
  /** Full text when modal has re-fetched beyond list preview truncation. */
  textOverride?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [mediaError, setMediaError] = useState(false);
  const text = textOverride ?? art.preview_text ?? null;
  const mediaSrc = artifactMediaUrl(companyId, art);

  if (art.type === "markdown" && text != null) {
    return (
      <div className={`text-sm text-body ${className}`}>
        <Markdown text={text} variant="article" />
      </div>
    );
  }

  // CSV / TSV → render as a GFM table when possible
  if (art.type === "table" && text != null) {
    const asMd = csvToMarkdownTable(text);
    if (asMd) {
      return (
        <div className={`text-sm text-body ${className}`}>
          <Markdown text={asMd} variant="article" />
        </div>
      );
    }
  }

  if (isTextArtifact(art) && text != null) {
    return (
      <pre
        className={`whitespace-pre-wrap font-mono text-xs leading-relaxed text-body bg-surface-2 border border-border-solid rounded p-3 overflow-x-auto ${className}`}
      >
        {text}
      </pre>
    );
  }

  if (art.type === "image" && mediaSrc && !mediaError) {
    return (
      <div className={`flex justify-center ${className}`}>
        <img
          src={mediaSrc}
          alt={art.name}
          className="max-w-full max-h-[60vh] rounded object-contain"
          onError={() => setMediaError(true)}
        />
      </div>
    );
  }

  if (art.type === "video" && mediaSrc && !mediaError) {
    return (
      <div className={`flex justify-center ${className}`}>
        <video
          src={mediaSrc}
          controls
          playsInline
          className="max-w-full max-h-[60vh] rounded bg-bg"
          onError={() => setMediaError(true)}
        >
          {t("common.preview.media-unsupported")}
        </video>
      </div>
    );
  }

  if (art.type === "audio" && mediaSrc && !mediaError) {
    return (
      <div className={`flex flex-col items-center gap-3 py-6 ${className}`}>
        <div className="text-4xl" aria-hidden>
          🎵
        </div>
        <audio
          src={mediaSrc}
          controls
          className="w-full max-w-md"
          onError={() => setMediaError(true)}
        >
          {t("common.preview.media-unsupported")}
        </audio>
      </div>
    );
  }

  if (art.type === "pdf" && mediaSrc && !mediaError) {
    return (
      <iframe
        title={art.name}
        src={mediaSrc}
        className={`w-full h-[60vh] rounded border border-border-solid bg-bg ${className}`}
        onError={() => setMediaError(true)}
      />
    );
  }

  return (
    <p className={`text-sm text-muted ${className}`}>
      {mediaError
        ? t("common.preview.media-error")
        : t("common.preview.none-download")}
    </p>
  );
}
