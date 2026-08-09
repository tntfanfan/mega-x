/**
 * Department display helpers — never show raw `dept-*` ids when a name exists.
 */

import type { DeptCatalogItem } from "./api";
import { DEPT_CATALOG } from "./fixtures";

const UNTITLED_ID_RE = /^dept-untitled(?:-\d+)?$/i;
const UNTITLED_NAME_RE = /^untitled(?:-\d+)?$/i;

export function resolveDeptDisplay(
  deptId: string,
  depts: Array<Pick<DeptCatalogItem, "id" | "name" | "emoji">> = [],
): { name: string; emoji: string; label: string } {
  const id = (deptId || "").trim();
  if (!id || UNTITLED_ID_RE.test(id)) {
    return { name: "未命名部门", emoji: "📁", label: "📁 未命名部门" };
  }

  const fromApi = depts.find((d) => d.id === id);
  const fromCatalog = DEPT_CATALOG.find((d) => d.id === id);
  const apiName = fromApi?.name?.trim();
  // Backend falls back to name===id when catalog misses; treat that as "no name".
  const realApiName = apiName && apiName !== id ? apiName : undefined;
  let name = realApiName || fromCatalog?.name || apiName || id;
  const emoji = (fromApi?.emoji || fromCatalog?.emoji || "").trim();

  if (UNTITLED_NAME_RE.test(name) || name === id && UNTITLED_ID_RE.test(id)) {
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
