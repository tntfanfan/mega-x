/**
 * /business/c/:companyId/depts — Flat list of departments (alternative to Canvas).
 */

import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";

type Ctx = { company: Company };
interface Row extends DeptCatalogItem { agent_count: number; active_tasks: number }

export default function DeptsView() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Row[] }>(`/v1/companies/${company.id}/depts`)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.company.depts.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((d) => `${d.name} ${d.id} ${d.short_desc}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <section className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl text-heading">{t("business.company.depts.title")}</h1>
        <p className="text-sm text-muted">{t("business.company.depts.subtitle", { count: items.length })}</p>
      </header>

      {loading ? <ListSkeleton rows={6} /> : (
      <>
      {items.length > 6 && (
        <SearchInput value={query} onChange={setQuery} placeholder={t("business.company.depts.search-placeholder")} className="w-full sm:w-64" />
      )}
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title={t("business.company.depts.no-match")} hint={t("common.keyword-hint")} />
      ) : (
      <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
        {filtered.map((d) => (
          <div key={d.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2">
            <span className="text-2xl shrink-0">{d.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{d.name}</div>
              <div className="text-[11px] text-muted font-mono">{d.id} · {d.short_desc}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-end">{t("business.company.depts.agents", { count: d.agent_count })}</div>
            <div className="text-xs shrink-0 w-20 text-end">
              {d.active_tasks > 0 ? <span className="text-spark-blue">{t("business.company.depts.tasks-active", { count: d.active_tasks })}</span> : <span className="text-dim">{t("business.company.depts.idle")}</span>}
            </div>
          </div>
        ))}
      </div>
      )}
      </>
      )}
    </section>
  );
}
