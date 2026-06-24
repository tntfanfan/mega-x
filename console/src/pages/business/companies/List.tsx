import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";

export default function CompaniesList() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Company[] }>("/v1/companies")
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.companies.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => `${c.name} ${c.description ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <section className="container py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">{t("business.companies.title")}</h1>
        <Link to="/business/companies/new" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent">{t("shell.switcher.create")}</Link>
      </header>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🏢"
          title={t("business.companies.empty.title")}
          hint={t("business.companies.empty.hint")}
          action={
            <Link to="/business/companies/new" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent">
              {t("shell.switcher.create")}
            </Link>
          }
        />
      ) : (
        <>
        {items.length > 4 && (
          <SearchInput value={query} onChange={setQuery} placeholder={t("business.companies.search-placeholder")} className="w-full sm:w-64" />
        )}
        {filtered.length === 0 ? (
          <EmptyState icon="🔍" title={t("business.companies.no-match")} hint={t("common.keyword-hint")} />
        ) : (
        <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
          {filtered.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{c.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{c.name}</div>
              <div className="text-[11px] text-muted truncate">{c.description}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-end">{c.dept_ids.length}{t("business.overview.company.depts-suffix")}</div>
            <div className="text-xs shrink-0 w-20 text-end">
              {c.state === "running" ? <span className="text-spark-mint">{t("business.overview.company.state.running")}</span> :
               c.state === "paused" ? <span className="text-spark-flare">{t("business.overview.company.state.paused")}</span> :
               <span className="text-muted">{c.state}</span>}
            </div>
            <Link to={`/business/c/${c.id}/`} className="text-xs text-primary hover:underline">{t("business.companies.open")}</Link>
          </div>
          ))}
        </div>
        )}
        </>
      )}
    </section>
  );
}
