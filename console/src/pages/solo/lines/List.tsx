/**
 * /solo/lines — 我的产线管理列表（与企业版公司列表同构）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";

export default function SoloLinesList() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Company[] }>("/v1/lines")
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) toast.error(apiErrorMessage(e, t("solo.lines.list.load-error"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, t]);

  const onDelete = useCallback(async (line: Company) => {
    if (!window.confirm(t("solo.line.settings.delete-confirm", { name: line.name }))) return;
    try {
      await api.delete(`/v1/lines/${line.id}`);
      setItems((prev) => prev.filter((x) => x.id !== line.id));
      toast.info(t("solo.line.settings.deleted"));
    } catch (err) {
      toast.error(apiErrorMessage(err, t("solo.line.settings.delete-error")));
    }
  }, [t, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((line) => `${line.name} ${line.description ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <section className="container py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">{t("solo.lines.list.title")}</h1>
        <Link to="/solo/lines/new" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent">
          {t("solo.overview.lines.create")}
        </Link>
      </header>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🚀"
          title={t("solo.lines.list.empty.title")}
          hint={t("solo.lines.list.empty.hint")}
          action={
            <Link to="/solo/lines/new" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent">
              {t("solo.overview.lines.create")}
            </Link>
          }
        />
      ) : (
        <>
        {items.length > 4 && (
          <SearchInput value={query} onChange={setQuery} placeholder={t("solo.lines.list.search-placeholder")} className="w-full sm:w-64" />
        )}
        {filtered.length === 0 ? (
          <EmptyState icon="🔍" title={t("solo.lines.list.no-match")} hint={t("common.keyword-hint")} />
        ) : (
        <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
          {filtered.map((line) => (
          <div key={line.id} className="group px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{line.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{line.name}</div>
              <div className="text-[11px] text-muted truncate">{line.description}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-end">
              {line.dept_ids.length}{t("solo.overview.lines.teams-suffix")}
            </div>
            <div className="text-xs shrink-0 w-20 text-end">
              {line.state === "running" ? <span className="text-spark-mint">{t("solo.overview.lines.state.running")}</span> :
               line.state === "paused" ? <span className="text-spark-flare">{t("solo.overview.lines.state.paused")}</span> :
               <span className="text-muted">{line.state}</span>}
            </div>
            <Link to={`/solo/l/${line.id}/`} className="text-xs text-primary hover:underline">{t("solo.lines.list.open")}</Link>
            <button
              type="button"
              onClick={() => onDelete(line)}
              title={t("solo.line.settings.delete")}
              aria-label={t("solo.line.settings.delete")}
              className="rounded px-1 text-sm leading-none text-muted opacity-0 group-hover:opacity-100 hover:text-fusion transition"
            >
              ✕
            </button>
          </div>
          ))}
        </div>
        )}
        </>
      )}
    </section>
  );
}
