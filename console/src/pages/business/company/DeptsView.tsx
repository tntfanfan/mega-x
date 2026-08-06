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
import { OrgCanvasPanel, type DeptWithMeta } from "./CanvasView";

type Ctx = { company: Company };

export default function DeptsView() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DeptWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: DeptWithMeta[] }>(`/v1/companies/${company.id}/depts`)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.company.depts.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id, toast, t]);

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
      company.dept_ids = company.dept_ids.filter((x) => x !== d.id);
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
    return items.filter((d) => `${d.name} ${d.id} ${d.short_desc}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="h-[calc(100vh-8rem-72px)] flex flex-col min-h-0">
      <header className="px-6 py-3 border-b border-border-solid bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <h1 className="font-display text-lg text-heading">{t("business.company.depts.title")}</h1>
          <p className="text-xs text-muted">{t("business.company.depts.subtitle", { count: items.length })}</p>
        </div>
        <Link
          to={`/business/c/${company.id}/marketplace`}
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          + {t("business.company.depts.add")}
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left — org node graph */}
        <div className="flex-1 min-w-0 border-e border-border-solid">
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
        <aside className="w-full max-w-md shrink-0 flex flex-col min-h-0 bg-surface/40">
          <div className="px-4 py-3 border-b border-border-solid shrink-0 space-y-2">
            <div className="text-xs text-muted">
              {t("business.company.depts.list-label")}
            </div>
            {items.length > 6 && (
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
                          <span className="text-muted">{t("business.company.depts.agents", { count: d.agent_count })}</span>
                          {d.active_tasks > 0 ? (
                            <span className="text-spark-blue">{t("business.company.depts.tasks-active", { count: d.active_tasks })}</span>
                          ) : (
                            <span className="text-dim">{t("business.company.depts.idle")}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={removing === d.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDept(d);
                        }}
                        className="shrink-0 rounded text-xs py-1 px-3 border border-fusion/50 text-fusion hover:bg-fusion/10 transition-colors disabled:opacity-50"
                      >
                        {removing === d.id ? t("business.company.depts.removing") : t("business.company.depts.remove")}
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
