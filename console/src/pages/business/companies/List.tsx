import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../../lib/api";
import type { Company } from "../../../lib/api";

export default function CompaniesList() {
  const [items, setItems] = useState<Company[]>([]);

  useEffect(() => {
    api.get<{ items: Company[] }>("/v1/companies").then((r) => setItems(r.items));
  }, []);

  return (
    <section className="container py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">我的公司</h1>
        <Link to="/business/companies/new" className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent">+ 创建新公司</Link>
      </header>

      <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
        {items.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{c.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{c.name}</div>
              <div className="text-[11px] text-muted truncate">{c.description}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-right">{c.dept_ids.length} 部门</div>
            <div className="text-xs shrink-0 w-20 text-right">
              {c.state === "running" ? <span className="text-spark-mint">🟢 运行中</span> :
               c.state === "paused" ? <span className="text-spark-flare">⏸ 已暂停</span> :
               <span className="text-muted">{c.state}</span>}
            </div>
            <Link to={`/business/c/${c.id}/`} className="text-xs text-primary hover:underline">打开 →</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
