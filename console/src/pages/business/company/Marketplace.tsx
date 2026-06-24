import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { api } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";

type Ctx = { company: Company };

export default function CompanyMarketplace() {
  const { company } = useOutletContext<Ctx>();
  const [items, setItems] = useState<DeptCatalogItem[]>([]);

  useEffect(() => {
    api.get<{ items: DeptCatalogItem[] }>("/v1/marketplace").then((r) => setItems(r.items));
  }, []);

  const enabled = new Set(company.dept_ids);

  return (
    <section className="p-6 space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">部门集市</h1>
        <p className="text-sm text-muted">将官方/第三方部门加装到「{company.name}」</p>
      </header>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((d) => {
          const installed = enabled.has(d.id);
          return (
            <div key={d.id} className="rounded-md border border-border-solid bg-surface p-4">
              <div className="flex items-start justify-between">
                <span className="text-2xl">{d.emoji}</span>
                <span className={`text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded ${
                  d.source_type === "builtin" ? "bg-primary/10 text-primary" : "bg-ai/10 text-ai"
                }`}>
                  {d.source_type === "builtin" ? "official" : "marketplace"}
                </span>
              </div>
              <h3 className="font-display text-sm text-heading mt-2 truncate">{d.name}</h3>
              <p className="text-[11px] text-muted truncate">{d.short_desc}</p>
              <div className="mt-2 text-[11px] text-body">
                {d.price_monthly === 0 ? "免费" : `¥${d.price_monthly}/月`}
              </div>
              <button
                disabled={installed}
                className="w-full mt-3 rounded text-xs py-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-bg hover:bg-accent"
              >
                {installed ? "已加装" : "加装"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
