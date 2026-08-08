/**
 * Client-side artifact download + copy + media URL helpers.
 *
 * The console is a static SPA talking to a (currently mocked) API, so there's
 * no server-rendered download route. These helpers resolve an artifact to
 * something the browser can actually save / play:
 *   1. a real `url` (download via temporary anchor), else
 *   2. `preview_text` (synthesize a Blob named after the artifact), else
 *   3. a `thumbnail_url` (image-only artifacts), else
 *   4. same-origin `/v1/companies/:id/artifacts/:id` for binary types, else
 *   5. nothing downloadable → caller surfaces an info toast.
 *
 * Returns a status so call sites can pick the right toast wording.
 */

import type { Artifact, ArtifactType } from "./api";

export type DownloadResult = "started" | "empty";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const MIME_BY_TYPE: Record<string, string> = {
  markdown: "text/markdown",
  code: "text/plain",
  json: "application/json",
  table: "text/csv",
};

const TEXT_TYPES = new Set<ArtifactType>(["markdown", "code", "json", "table"]);
const MEDIA_TYPES = new Set<ArtifactType>(["image", "video", "audio", "pdf"]);

export function isTextArtifact(art: Pick<Artifact, "type">): boolean {
  return TEXT_TYPES.has(art.type);
}

/** Best URL for <img>/<video>/<audio>/<iframe> — prefers explicit url fields. */
export function artifactMediaUrl(
  companyId: string,
  art: Pick<Artifact, "id" | "type" | "url" | "thumbnail_url">,
): string | undefined {
  if (art.url) return art.url;
  if (art.thumbnail_url) return art.thumbnail_url;
  if (MEDIA_TYPES.has(art.type) && companyId && art.id) {
    return `${API_BASE}/v1/companies/${companyId}/artifacts/${art.id}`;
  }
  return undefined;
}

function triggerAnchor(href: string, filename?: string) {
  const a = document.createElement("a");
  a.href = href;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadArtifact(art: Artifact): DownloadResult {
  if (art.url) {
    triggerAnchor(art.url, art.name);
    return "started";
  }
  if (art.preview_text != null) {
    const mime = MIME_BY_TYPE[art.type] ?? "text/plain";
    const blob = new Blob([art.preview_text], { type: `${mime};charset=utf-8` });
    const objUrl = URL.createObjectURL(blob);
    triggerAnchor(objUrl, art.name);
    // Revoke on the next tick — the click has already been dispatched.
    setTimeout(() => URL.revokeObjectURL(objUrl), 0);
    return "started";
  }
  if (art.thumbnail_url) {
    triggerAnchor(art.thumbnail_url, art.name);
    return "started";
  }
  return "empty";
}

/** Copy an artifact's preview text to the clipboard. Throws if unsupported. */
export async function copyArtifactText(art: Artifact): Promise<boolean> {
  if (art.preview_text == null) return false;
  await navigator.clipboard.writeText(art.preview_text);
  return true;
}
