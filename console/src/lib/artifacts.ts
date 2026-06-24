/**
 * Client-side artifact download + copy helpers.
 *
 * The console is a static SPA talking to a (currently mocked) API, so there's
 * no server-rendered download route. These helpers resolve an artifact to
 * something the browser can actually save:
 *   1. a real `url` (download via temporary anchor), else
 *   2. `preview_text` (synthesize a Blob named after the artifact), else
 *   3. a `thumbnail_url` (image-only artifacts), else
 *   4. nothing downloadable → caller surfaces an info toast.
 *
 * Returns a status so call sites can pick the right toast wording.
 */

import type { Artifact } from "./api";

export type DownloadResult = "started" | "empty";

const MIME_BY_TYPE: Record<string, string> = {
  markdown: "text/markdown",
  code: "text/plain",
  json: "application/json",
  table: "text/csv",
};

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
