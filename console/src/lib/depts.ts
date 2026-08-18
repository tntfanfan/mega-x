/**
 * Department display helpers — never show raw `dept-*` ids when a name exists.
 *
 * Display name may be Chinese; directory id must be dept-{ascii-slug}.
 *
 * Localization: official depts carry `dept.<id>.name` / `dept.<id>.desc` keys.
 * The backend sends them as `name_key` / `desc_key`; we also derive them from
 * `DEPT_CATALOG` membership so mock mode localizes identically (mocks.ts serves
 * DEPT_CATALOG rows, which carry no keys). The raw `name` stays the i18n
 * `defaultValue`, so a missing translation degrades to Chinese rather than to a
 * literal key string — and third-party depts, which never have a key, keep their
 * Studio title.
 */

import type { TFunction } from "i18next";

import i18n from "../i18n";
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

type DeptLike = Pick<DeptCatalogItem, "id" | "name" | "emoji"> &
  Partial<Pick<DeptCatalogItem, "short_desc" | "name_key" | "desc_key">>;

/** Keys are derivable, so there is no second list of them to drift. */
export function deptNameKey(deptId: string): string {
  return `dept.${deptId}.name`;
}

export function deptDescKey(deptId: string): string {
  return `dept.${deptId}.desc`;
}

function isOfficialDept(deptId: string): boolean {
  return DEPT_CATALOG.some((d) => d.id === deptId);
}

export function resolveDeptDisplay(
  deptId: string,
  depts: DeptLike[] = [],
  // Default to the singleton so the ~36 existing call sites need no change.
  // Call sites already inside useTranslation() should pass their own `t` so the
  // label re-renders on a language switch.
  t: TFunction = i18n.t,
): { name: string; emoji: string; label: string } {
  const id = (deptId || "").trim();
  if (!id) {
    return { name: t("dept.unnamed"), emoji: "📁", label: `📁 ${t("dept.unnamed")}` };
  }

  const fromApi = depts.find((d) => d.id === id);
  const fromCatalog = DEPT_CATALOG.find((d) => d.id === id);
  const apiName = fromApi?.name?.trim();
  // Backend falls back to name===id when catalog misses; treat that as "no name".
  const realApiName = apiName && apiName !== id ? apiName : undefined;
  let name = realApiName || fromCatalog?.name || apiName || id;
  const emoji = (fromApi?.emoji || fromCatalog?.emoji || "").trim();

  // Translate before the placeholder checks below: a translated name must not be
  // mistaken for the untitled sentinel.
  const nameKey = fromApi?.name_key || (isOfficialDept(id) ? deptNameKey(id) : undefined);
  if (nameKey) {
    name = t(nameKey, { defaultValue: name });
  }

  // Only the literal placeholder name "untitled" means unnamed.
  // Transient dept-untitled-* ids (before slug rename) should still prefer API name;
  // if API hasn't enriched yet, don't flash「未命名部门」— show a neutral label.
  if (UNTITLED_NAME_RE.test(name)) {
    const unnamed = t("dept.unnamed");
    return { name: unnamed, emoji: emoji || "📁", label: `${emoji || "📁"} ${unnamed}` };
  }

  if (name === id && UNTITLED_ID_RE.test(id)) {
    if (!fromApi) {
      // Still loading company /depts — avoid lying about the title.
      return { name: "…", emoji: emoji || "📁", label: `${emoji || "📁"} …` };
    }
    const unnamed = t("dept.unnamed");
    return { name: unnamed, emoji: emoji || "📁", label: `${emoji || "📁"} ${unnamed}` };
  }

  // Last resort: strip dept- prefix so raw ids aren't shown as-is.
  if (name === id && /^dept-/i.test(id)) {
    name = id.replace(/^dept-/i, "").replace(/-/g, " ") || t("dept.unnamed");
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    const em = emoji || "🏢";
    return { name: pretty, emoji: em, label: `${em} ${pretty}` };
  }

  return { name, emoji, label: `${emoji ? `${emoji} ` : ""}${name}` };
}

/**
 * Localized `short_desc`. Separate from `resolveDeptDisplay` because the three
 * call sites that render a description (DeptsView / both Marketplaces / TeamView)
 * already have the dept object in hand and don't need name resolution.
 */
export function resolveDeptDesc(
  dept: Pick<DeptCatalogItem, "id"> & Partial<Pick<DeptCatalogItem, "short_desc" | "desc_key">>,
  t: TFunction = i18n.t,
): string {
  const raw = dept.short_desc || "";
  const key = dept.desc_key || (isOfficialDept(dept.id) ? deptDescKey(dept.id) : undefined);
  return key ? t(key, { defaultValue: raw }) : raw;
}
