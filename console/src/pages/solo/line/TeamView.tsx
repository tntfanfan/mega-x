/**
 * /solo/l/:lineId/ — 团队（列表 / 组织图，与企业版部门页同构）。
 *
 * 列表：卡片网格。组织图：左 Org Canvas，右已安装团队列表。
 * 成员按卡片懒加载 /depts/:id/agents，与企业版 DeptsView 同一套展开逻辑。
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
  const apiRoot = `/v1/lines/${line.id}`;
  // Same lazy-per-dept fetch as DeptsView: expanding one team must not N+1
  // the rest, and a member failure must not blank the team list.
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
          .get<{ items: TeammateView[] }>(`${apiRoot}/depts/${deptId}/agents`)
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
      .get<{ items: DeptWithMeta[] }>(`${apiRoot}/depts`)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("solo.line.team.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiRoot, (line.dept_ids || []).join(","), toast, t]);

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
    return items.filter((d) =>
      `${d.name} ${resolveDeptDisplay(d.id, [d], t).name} ${d.id} ${d.short_desc} ${resolveDeptDesc(d, t)}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query, t]);

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
                  const open = expanded.has(d.id);
                  const panelId = `team-members-${d.id}`;
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
                              ? t("solo.line.team.members.hide")
                              : t("solo.line.team.members.show", { count: d.agent_count })}
                          </button>
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
