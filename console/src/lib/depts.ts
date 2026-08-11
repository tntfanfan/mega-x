/**
 * Department display helpers — never show raw `dept-*` ids when a name exists.
 *
 * Display name may be Chinese; directory id must be dept-{ascii-slug}. Prefer
 * the API / catalog display name; only fall back to「未命名部门」when the name
 * is still a literal untitled placeholder.
 */

import type { DeptCatalogItem } from "./api";
import { DEPT_CATALOG } from "./fixtures";

const UNTITLED_ID_RE = /^dept-untitled(?:-\d+)?$/i;
const UNTITLED_NAME_RE = /^untitled(?:-\d+)?$/i;

/** Mirror backend sanitize_short: lowercase ascii slug or "". */
export function sanitizeDeptShort(name: string): string {
  let s = name.trim().toLowerCase().replace(/[\s_]+/g, "-");
  s = s.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.startsWith("dept-")) s = s.slice("dept-".length);
  return s;
}

export function needsDeptSlug(displayName: string): boolean {
  return !sanitizeDeptShort(displayName);
}

export function resolveDeptDisplay(
  deptId: string,
  depts: Array<Pick<DeptCatalogItem, "id" | "name" | "emoji">> = [],
): { name: string; emoji: string; label: string } {
  const id = (deptId || "").trim();
  if (!id) {
    return { name: "未命名部门", emoji: "📁", label: "📁 未命名部门" };
  }

  const fromApi = depts.find((d) => d.id === id);
  const fromCatalog = DEPT_CATALOG.find((d) => d.id === id);
  const apiName = fromApi?.name?.trim();
  // Backend falls back to name===id when catalog misses; treat that as "no name".
  const realApiName = apiName && apiName !== id ? apiName : undefined;
  let name = realApiName || fromCatalog?.name || apiName || id;
  const emoji = (fromApi?.emoji || fromCatalog?.emoji || "").trim();

  // Only the literal placeholder name "untitled" means unnamed.
  // Transient dept-untitled-* ids (before slug rename) should still prefer API name;
  // if API hasn't enriched yet, don't flash「未命名部门」— show a neutral label.
  if (UNTITLED_NAME_RE.test(name)) {
    return { name: "未命名部门", emoji: emoji || "📁", label: `${emoji || "📁"} 未命名部门` };
  }

  if (name === id && UNTITLED_ID_RE.test(id)) {
    if (!fromApi) {
      // Still loading company /depts — avoid lying about the title.
      return { name: "…", emoji: emoji || "📁", label: `${emoji || "📁"} …` };
    }
    return { name: "未命名部门", emoji: emoji || "📁", label: `${emoji || "📁"} 未命名部门` };
  }

  // Last resort: strip dept- prefix so raw ids aren't shown as-is.
  if (name === id && /^dept-/i.test(id)) {
    name = id.replace(/^dept-/i, "").replace(/-/g, " ") || "未命名部门";
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    const em = emoji || "🏢";
    return { name: pretty, emoji: em, label: `${em} ${pretty}` };
  }

  return { name, emoji, label: `${emoji ? `${emoji} ` : ""}${name}` };
}
