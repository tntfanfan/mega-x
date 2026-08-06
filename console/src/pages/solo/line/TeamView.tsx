/**
 * /solo/l/:lineId/ — 团队（节点图 + 列表左右分栏）。
 *
 * 与企业版「部门」页同构：左 Org Canvas，右已安装团队列表。
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
import { OrgCanvasPanel, type DeptWithMeta } from "../../business/company/CanvasView";

type Ctx = { line: Company };

export default function TeamView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DeptWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  }, [apiRoot, toast, t]);

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
      line.dept_ids = line.dept_ids.filter((x) => x !== d.id);
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
    return items.filter((d) => `${d.name} ${d.id} ${d.short_desc}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">{t("solo.line.team.title")}</h1>
          <p className="text-xs text-muted">{t("solo.line.team.subtitle", { count: items.length })}</p>
        </div>
        <Link
          to={`/solo/l/${line.id}/marketplace`}
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          + {t("solo.line.team.add-team")}
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-e border-border-solid">
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

        <aside className="w-full max-w-md shrink-0 flex flex-col min-h-0 bg-surface/40">
          <div className="px-4 py-3 border-b border-border-solid shrink-0 space-y-2">
            <div className="text-xs text-muted">{t("solo.line.team.list-label")}</div>
            {items.length > 6 && (
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
              <div className="divide-y divide-border-solid">
                {filtered.map((d) => {
                  const selected = selectedDeptId === d.id;
                  return (
                    <div
                      key={d.id}
                      ref={(el) => { rowRefs.current[d.id] = el; }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDeptId(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedDeptId(d.id);
                        }
                      }}
                      className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
                        selected
                          ? "bg-surface-2 border-s-2 border-primary"
                          : "border-s-2 border-transparent hover:bg-surface-2"
                      }`}
                    >
                      <span className="text-2xl shrink-0">{d.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-heading truncate">{d.name}</div>
                        <div className="text-[11px] text-muted font-mono truncate">{d.id} · {d.short_desc}</div>
                        <div className="mt-1 flex gap-3 text-[11px]">
                          <span className="text-muted">{t("solo.line.team.agents", { count: d.agent_count })}</span>
                          {d.active_tasks > 0 ? (
                            <span className="text-spark-blue">{t("solo.line.team.tasks-active", { count: d.active_tasks })}</span>
                          ) : (
                            <span className="text-dim">{t("solo.line.team.idle")}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={removing === d.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTeam(d);
                        }}
                        className="shrink-0 rounded text-xs py-1 px-3 border border-fusion/50 text-fusion hover:bg-fusion/10 transition-colors disabled:opacity-50"
                      >
                        {removing === d.id ? t("solo.line.team.removing") : t("solo.line.team.remove")}
                      </button>
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
