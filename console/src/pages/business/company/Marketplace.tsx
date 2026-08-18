import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { CardGridSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Segmented, type SegmentedOption } from "../../../components/ui/Segmented";
import { resolveDeptDisplay, resolveDeptDesc } from "../../../lib/depts";

type Ctx = { company: Company };
type SourceFilter = "all" | "builtin" | "marketplace";

export default function CompanyMarketplace() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<DeptCatalogItem[]>([]);
  // Locally tracked enabled set, seeded from the company so installs reflect
  // immediately without a full company refetch through the outlet context.
  const [enabled, setEnabled] = useState<Set<string>>(new Set(company.dept_ids));
  const [installing, setInstalling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: DeptCatalogItem[] }>("/v1/marketplace")
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("business.company.marketplace.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, t]);

  const install = async (d: DeptCatalogItem) => {
    setInstalling(d.id);
    try {
      await api.post(`/v1/companies/${company.id}/depts`, { dept_id: d.id });
      setEnabled((cur) => new Set(cur).add(d.id));
      company.dept_ids = Array.from(new Set([...company.dept_ids, d.id]));
      toast.success(t("business.company.marketplace.install-success", { name: d.name }));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("business.company.marketplace.install-error", { name: d.name })));
    } finally {
      setInstalling(null);
    }
  };

  const uninstall = async (d: DeptCatalogItem) => {
    if (!window.confirm(t("business.company.marketplace.uninstall-confirm", { name: d.name }))) return;
    setInstalling(d.id);
    try {
      await api.delete(`/v1/companies/${company.id}/depts/${d.id}`);
      setEnabled((cur) => {
        const next = new Set(cur);
        next.delete(d.id);
        return next;
      });
      company.dept_ids = company.dept_ids.filter((x) => x !== d.id);
      toast.success(t("business.company.marketplace.uninstall-success", { name: d.name }));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("business.company.marketplace.uninstall-error", { name: d.name })));
    } finally {
      setInstalling(null);
    }
  };

  // Internal-only depts arrive tagged `hidden` rather than dropped, so a
  // company that already installed one keeps its uninstall affordance.
  const visible = useMemo(
    () => items.filter((d) => !d.hidden || enabled.has(d.id)),
    [items, enabled],
  );

  const sourceOptions = useMemo<SegmentedOption<SourceFilter>[]>(() => [
    { value: "all", label: t("business.company.marketplace.source.all"), count: visible.length },
    { value: "builtin", label: t("business.company.marketplace.source.official"), count: visible.filter((d) => d.source_type === "builtin").length },
    { value: "marketplace", label: t("business.company.marketplace.source.thirdparty"), count: visible.filter((d) => d.source_type === "marketplace").length },
  ], [visible, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((d) => {
      if (source !== "all" && d.source_type !== source) return false;
      if (!q) return true;
      // Search the *localized* strings too, so typing what you see matches.
      return `${d.name} ${resolveDeptDisplay(d.id, [d], t).name} ${d.short_desc} ${resolveDeptDesc(d, t)} ${d.id}`
        .toLowerCase()
        .includes(q);
    });
  }, [visible, query, source, t]);

  return (
    <section className="p-6 space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("business.company.marketplace.title")}</h1>
        <p className="text-sm text-muted">{t("business.company.marketplace.subtitle", { company: company.name })}</p>
      </header>

      {loading ? <CardGridSkeleton count={8} /> : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={sourceOptions} value={source} onChange={(v) => setSource(v)} />
        <SearchInput value={query} onChange={setQuery} placeholder={t("business.company.marketplace.search-placeholder")} className="w-full sm:w-64" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title={t("business.company.marketplace.no-match")} hint={t("common.filter-hint")} />
      ) : (
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((d) => {
          const installed = enabled.has(d.id);
          const busy = installing === d.id;
          return (
            <div key={d.id} className="rounded-md border border-border-solid bg-surface p-4">
              <div className="flex items-start justify-between">
                <span className="text-2xl">{d.emoji}</span>
                <span className={`text-xs tracking-widest uppercase px-1.5 py-0.5 rounded ${
                  d.source_type === "builtin" ? "bg-primary/10 text-primary" : "bg-ai/10 text-ai"
                }`}>
                  {d.source_type === "builtin"
                    ? t("business.company.marketplace.source.official")
                    : t("business.company.marketplace.source.thirdparty")}
                </span>
              </div>
              <h2 className="font-display text-base text-heading mt-2 truncate" title={resolveDeptDisplay(d.id, [d], t).name}>{resolveDeptDisplay(d.id, [d], t).name}</h2>
              <p className="text-xs text-muted truncate">{resolveDeptDesc(d, t)}</p>
              <div className="mt-2 text-xs text-body">
                {d.price_monthly === 0 ? t("common.free") : t("common.price-monthly", { price: d.price_monthly })}
              </div>
              {installed ? (
                <div className="mt-3 flex gap-2">
                  <span className="flex-1 rounded text-xs py-1.5 text-center text-muted border border-border-solid">
                    {t("business.company.marketplace.installed")}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => uninstall(d)}
                    className="rounded text-xs py-1.5 px-3 border border-fusion/50 text-fusion hover:bg-fusion/10 transition-colors disabled:opacity-50"
                  >
                    {busy ? t("business.company.marketplace.uninstalling") : t("business.company.marketplace.uninstall")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => install(d)}
                  className="w-full mt-3 rounded text-xs py-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-bg hover:bg-accent"
                >
                  {busy ? t("business.company.marketplace.installing") : t("business.company.marketplace.install")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}
      </>
      )}
    </section>
  );
}
