/**
 * /solo/l/:lineId/ — 团队（列表 / 组织图，与企业版部门页同构）。
 *
 * 列表：卡片网格。组织图：左 Org Canvas，右已安装团队列表。
 * 两侧共用选中态：点节点 ↔ 点列表行。
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Segmented, type SegmentedOption } from "../../../components/ui/Segmented";
import { resolveDeptDisplay, resolveDeptDesc, deptNameKey } from "../../../lib/depts";
import { RoleGroupCard, type TeammateGroup } from "../../../components/solo/RoleGroupCard";
import { OrgCanvasPanel, type DeptWithMeta } from "../../business/company/CanvasView";

type Ctx = { line: Company; refreshLine?: () => Promise<void> };
type ViewMode = "list" | "org";

export default function TeamView() {
  const { line, refreshLine } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DeptWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [groups, setGroups] = useState<TeammateGroup[]>([]);
  const apiRoot = `/v1/lines/${line.id}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: DeptWithMeta[] }>(`${apiRoot}/depts`)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("solo.line.team.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiRoot, (line.dept_ids || []).join(","), toast, t]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ groups: TeammateGroup[] }>(`${apiRoot}/teammates`)
      // Members are supplementary: a failure must not blank the dept list, so
      // this degrades to "no member panel" rather than surfacing a toast.
      .then((r) => { if (!cancelled) setGroups(r.groups || []); })
      .catch(() => { if (!cancelled) setGroups([]); });
    return () => { cancelled = true; };
  }, [apiRoot]);

  useEffect(() => {
    if (!selectedDeptId) return;
    const el = rowRefs.current[selectedDeptId];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedDeptId]);

  const removeTeam = async (d: DeptWithMeta) => {
    if (!window.confirm(t("solo.line.team.remove-confirm", { name: d.name }))) return;
    setRemoving(d.id);
    try {
      await api.delete(`${apiRoot}/depts/${d.id}`);
      setItems((cur) => cur.filter((x) => x.id !== d.id));
      await refreshLine?.();
      if (selectedDeptId === d.id) setSelectedDeptId(null);
      toast.success(t("solo.line.team.remove-success", { name: d.name }));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("solo.line.team.remove-error", { name: d.name })));
    } finally {
      setRemoving(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Search the *localized* strings too, so typing what you see matches.
    return items.filter((d) =>
      `${d.name} ${resolveDeptDisplay(d.id, [d], t).name} ${d.id} ${d.short_desc} ${resolveDeptDesc(d, t)}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query, t]);

  const selectedGroup = useMemo<TeammateGroup | null>(() => {
    if (!selectedDeptId) return null;
    const g = groups.find((x) => x.dept_id === selectedDeptId);
    if (!g) return null;
    const dept = items.find((d) => d.id === selectedDeptId);
    return {
      ...g,
      // The API sends fallback_label (the raw dept name); point the card at the
      // dept's i18n key so the group header follows the language switch.
      label_key: deptNameKey(g.dept_id),
      fallback_label: dept ? resolveDeptDisplay(dept.id, [dept], t).name : g.fallback_label,
    };
  }, [selectedDeptId, groups, items, t]);

  const viewOptions = useMemo<SegmentedOption<ViewMode>[]>(
    () => [
      { value: "list", label: t("solo.line.team.view.list") },
      { value: "org", label: t("solo.line.team.view.org") },
    ],
    [t],
  );

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">{t("solo.line.team.title")}</h1>
          <p className="text-xs text-muted">{t("solo.line.team.subtitle", { count: items.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Segmented options={viewOptions} value={viewMode} onChange={setViewMode} />
          <Link
            to={`/solo/l/${line.id}/marketplace`}
            className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
          >
            + {t("solo.line.team.add-team")}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className={`${viewMode === "org" ? "flex-1 min-w-0 border-e border-border-solid" : "hidden"}`}>
          {loading ? (
            <p className="p-6 text-sm text-body">{t("common.loading")}…</p>
          ) : (
            <OrgCanvasPanel
              company={line}
              depts={items}
              selectedDeptId={selectedDeptId}
              onSelectDept={setSelectedDeptId}
              apiRoot={apiRoot}
            />
          )}
        </div>

        <aside
          aria-label={t("solo.line.team.list-label")}
          className={`w-full shrink-0 flex flex-col min-h-0 bg-surface/40 ${
            viewMode === "org" ? "max-w-md" : ""
          }`}
        >
          <div className="px-4 py-3 border-b border-border-solid shrink-0 space-y-2">
            <div className="text-xs text-muted">
              {t("solo.line.team.list-label")}
            </div>
            {items.length > 0 && (
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t("solo.line.team.search-placeholder")}
                className="w-full"
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-4"><ListSkeleton rows={6} /></div>
            ) : items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon="👥"
                  title={t("solo.line.team.empty")}
                  hint={t("solo.line.team.empty-hint")}
                  action={
                    <Link
                      to={`/solo/l/${line.id}/marketplace`}
                      className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      {t("solo.line.team.add-team")}
                    </Link>
                  }
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState icon="🔍" title={t("solo.line.team.no-match")} hint={t("common.keyword-hint")} />
              </div>
            ) : (
              <div className={viewMode === "org"
                ? "divide-y divide-border-solid"
                : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 p-4"
              }>
                {filtered.map((d) => {
                  const selected = selectedDeptId === d.id;
                  return (
                    <div
                      key={d.id}
                      ref={(el) => { rowRefs.current[d.id] = el; }}
                      className={`flex items-center transition-colors ${
                        viewMode === "list" ? "rounded-md border border-border-solid bg-surface" : ""
                      } ${
                        selected
                          ? "bg-surface-2 border-s-2 border-primary"
                          : viewMode === "org"
                            ? "border-s-2 border-transparent hover:bg-surface-2"
                            : "hover:border-primary/50"
                      }`}
                    >
                      {/* Upstream's button-wrapped row (matches DeptsView) with the
                          localized name/desc from the i18n pass. */}
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedDeptId(d.id)}
                        className="min-w-0 flex flex-1 items-center gap-3 px-4 py-3 text-start"
                      >
                        <span className="text-2xl shrink-0">{d.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-heading truncate" title={resolveDeptDisplay(d.id, [d], t).name}>{resolveDeptDisplay(d.id, [d], t).name}</div>
                          <div className="text-xs text-muted truncate">{resolveDeptDesc(d, t)}</div>
                          <div className="mt-1 text-xs font-mono text-dim truncate">{d.id}</div>
                          <div className="mt-2 flex gap-3 text-xs">
                            <span className="text-muted">{t("solo.line.team.agents", { count: d.agent_count })}</span>
                            {d.active_tasks > 0 ? (
                              <span className="text-spark-blue">{t("solo.line.team.tasks-active", { count: d.active_tasks })}</span>
                            ) : (
                              <span className="text-dim">{t("solo.line.team.idle")}</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={removing === d.id}
                        onClick={() => removeTeam(d)}
                        className="me-3 shrink-0 rounded text-xs py-1 px-3 border border-fusion/50 text-fusion hover:bg-fusion/10 transition-colors disabled:opacity-50"
                      >
                        {removing === d.id ? t("solo.line.team.removing") : t("solo.line.team.remove")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Selected dept's members. Reuses RoleGroupCard, which was written for
              exactly this and had no importer until now. */}
          {selectedGroup && (
            <div className="shrink-0 border-t border-border-solid p-4">
              <RoleGroupCard group={selectedGroup} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
