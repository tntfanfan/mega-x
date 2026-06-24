/**
 * /business/c/:companyId/depts — Flat list of departments (alternative to Canvas).
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";

type Ctx = { company: Company };
interface Row extends DeptCatalogItem { agent_count: number; active_tasks: number }

export default function DeptsView() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [items, setItems] = useState<Row[]>([]);

  useEffect(() => {
    api.get<{ items: Row[] }>(`/v1/companies/${company.id}/depts`).then((r) => setItems(r.items));
  }, [company.id]);

  return (
    <section className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl text-heading">{t("business.company.depts.title")}</h1>
        <p className="text-sm text-muted">{t("business.company.depts.subtitle", { count: items.length })}</p>
      </header>

      <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
        {items.map((d) => (
          <div key={d.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2">
            <span className="text-2xl shrink-0">{d.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{d.name}</div>
              <div className="text-[11px] text-muted font-mono">{d.id} · {d.short_desc}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-right">{d.agent_count} agents</div>
            <div className="text-xs shrink-0 w-20 text-right">
              {d.active_tasks > 0 ? <span className="text-spark-blue">{d.active_tasks} task(s)</span> : <span className="text-dim">idle</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
