/**
 * /business/c/:companyId/ — 部门（节点图 + 列表左右分栏）。
 *
 * 左：Org Canvas（HQ + 部门节点图）
 * 右：已安装部门列表（搜索 / 移除 / 去集市安装）
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
import { resolveDeptDisplay, resolveDeptDesc } from "../../../lib/depts";
import { TeammateAvatar, type TeammateView } from "../../../components/solo/TeammateAvatar";
import { OrgCanvasPanel, type DeptWithMeta } from "./CanvasView";

type Ctx = { company: Company; refreshCompany?: () => Promise<void> };
type ViewMode = "list" | "org";

export default function DeptsView() {
  const { company, refreshCompany } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DeptWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Members are fetched lazily per dept on first expand: business has no
  // /teammates route (that one is solo-only), so eager loading would be an N+1
  // over every installed dept just to populate a collapsed panel.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Record<string, TeammateView[]>>({});

  const toggleExpanded = (deptId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
        return next;
      }
      next.add(deptId);
      if (!members[deptId]) {
        api
          .get<{ items: TeammateView[] }>(`/v1/companies/${company.id}/depts/${deptId}/agents`)
          // Supplementary panel: on failure show an empty list rather than a
          // toast, so a member fetch can never disrupt the dept list itself.
          .then((r) => setMembers((cur) => ({ ...cur, [deptId]: r.items || [] })))
          .catch(() => setMembers((cur) => ({ ...cur, [deptId]: [] })));
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: DeptWithMeta[] }>(`/v1/companies/${company.id}/depts`)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.company.depts.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id, (company.dept_ids || []).join(","), toast, t]);

  // Scroll list row into view when selection comes from the canvas.
  useEffect(() => {
    if (!selectedDeptId) return;
    const el = rowRefs.current[selectedDeptId];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedDeptId]);

  const removeDept = async (d: DeptWithMeta) => {
    if (!window.confirm(t("business.company.depts.remove-confirm", { name: d.name }))) return;
    setRemoving(d.id);
    try {
      await api.delete(`/v1/companies/${company.id}/depts/${d.id}`);
      setItems((cur) => cur.filter((x) => x.id !== d.id));
      await refreshCompany?.();
      if (selectedDeptId === d.id) setSelectedDeptId(null);
      toast.success(t("business.company.depts.remove-success", { name: d.name }));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("business.company.depts.remove-error", { name: d.name })));
    } finally {
      setRemoving(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Search the *localized* strings too, so typing what you see on screen matches.
    return items.filter((d) =>
      `${d.name} ${resolveDeptDisplay(d.id, [d], t).name} ${d.id} ${d.short_desc} ${resolveDeptDesc(d, t)}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query, t]);
  const viewOptions = useMemo<SegmentedOption<ViewMode>[]>(
    () => [
      { value: "list", label: t("business.company.depts.view.list") },
      { value: "org", label: t("business.company.depts.view.org") },
    ],
    [t],
  );

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">{t("business.company.depts.title")}</h1>
          <p className="text-xs text-muted">{t("business.company.depts.subtitle", { count: items.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Segmented options={viewOptions} value={viewMode} onChange={setViewMode} />
          <Link
            to={`/business/c/${company.id}/marketplace`}
            className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
          >
            + {t("business.company.depts.add")}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left — org node graph */}
        <div className={`${viewMode === "org" ? "flex-1 min-w-0 border-e border-border-solid" : "hidden"}`}>
          {loading ? (
            <p className="p-6 text-sm text-body">{t("common.loading")}…</p>
          ) : (
            <OrgCanvasPanel
              company={company}
              depts={items}
              selectedDeptId={selectedDeptId}
              onSelectDept={setSelectedDeptId}
            />
          )}
        </div>

        {/* Right — department list */}
        <aside
          aria-label={t("business.company.depts.list-label")}
          className={`w-full shrink-0 flex flex-col min-h-0 bg-surface/40 ${
            viewMode === "org" ? "max-w-md" : ""
          }`}
        >
          <div className="px-4 py-3 border-b border-border-solid shrink-0 space-y-2">
            <div className="text-xs text-muted">
              {t("business.company.depts.list-label")}
            </div>
            {items.length > 0 && (
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t("business.company.depts.search-placeholder")}
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
                  icon="🏢"
                  title={t("business.company.depts.empty.title")}
                  hint={t("business.company.depts.empty.hint")}
                  action={
                    <Link
                      to={`/business/c/${company.id}/marketplace`}
                      className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      {t("business.company.depts.empty.cta")}
                    </Link>
                  }
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState icon="🔍" title={t("business.company.depts.no-match")} hint={t("common.keyword-hint")} />
              </div>
            ) : (
              <div className={viewMode === "org"
                ? "divide-y divide-border-solid"
                : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 p-4"
              }>
                {filtered.map((d) => {
                  const selected = selectedDeptId === d.id;
                  const open = expanded.has(d.id);
                  const panelId = `dept-members-${d.id}`;
                  return (
                    <div
                      key={d.id}
                      ref={(el) => { rowRefs.current[d.id] = el; }}
                      className={`flex flex-col transition-colors ${
                        viewMode === "list" ? "rounded-md border border-border-solid bg-surface" : ""
                      } ${
                        selected
                          ? "bg-surface-2 border-s-2 border-primary"
                          : viewMode === "org"
                            ? "border-s-2 border-transparent hover:bg-surface-2"
                            : "hover:border-primary/50"
                      }`}
                    >
                      {/* Inner row keeps the original two-sibling-button layout;
                          the expander + member panel stack below it. */}
                      <div className="flex items-center">
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
                            <span className="text-muted">{t("business.company.depts.agents", { count: d.agent_count })}</span>
                            {d.active_tasks > 0 ? (
                              <span className="text-spark-blue">{t("business.company.depts.tasks-active", { count: d.active_tasks })}</span>
                            ) : (
                              <span className="text-dim">{t("business.company.depts.idle")}</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={removing === d.id}
                        onClick={() => removeDept(d)}
                        className="me-3 shrink-0 rounded text-xs py-1 px-3 border border-fusion/50 text-fusion hover:bg-fusion/10 transition-colors disabled:opacity-50"
                      >
                        {removing === d.id ? t("business.company.depts.removing") : t("business.company.depts.remove")}
                      </button>
                      </div>

                      {d.agent_count > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(d.id)}
                            aria-expanded={open}
                            aria-controls={panelId}
                            className="w-full flex items-center gap-1 px-4 pb-3 text-[11px] text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          >
                            <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                            {open
                              ? t("business.company.depts.members.hide")
                              : t("business.company.depts.members.show", { count: d.agent_count })}
                          </button>
                          {/* Tailwind's `hidden` CLASS, not the hidden ATTRIBUTE:
                              [hidden]{display:none} loses to an author display:flex,
                              so hidden={!open} would render visible. */}
                          <div
                            id={panelId}
                            className={`px-4 pb-4 flex-wrap gap-3 ${open ? "flex" : "hidden"}`}
                          >
                            {(members[d.id] ?? []).map((tm) => (
                              <TeammateAvatar
                                key={tm.id}
                                teammate={tm}
                                size="sm"
                                title={tm.title_key ? t(tm.title_key, { defaultValue: tm.display_name }) : tm.display_name}
                                bubble={tm.bubble_key ? t(tm.bubble_key, { defaultValue: tm.bubble }) : tm.bubble}
                              />
                            ))}
                            {members[d.id] === undefined && (
                              <span className="text-[11px] text-dim">{t("common.loading")}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
