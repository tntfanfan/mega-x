/**
 * /solo/lines — 我的产线管理列表（简洁表格式，跟 Overview 卡片视图二选一）。
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company } from "../../../lib/api";

export default function SoloLinesList() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Company[]>([]);

  useEffect(() => {
    api.get<{ items: Company[] }>("/v1/lines").then((r) => setItems(r.items));
  }, []);

  return (
    <section className="container py-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">{t("solo.lines.list.title")}</h1>
          <p className="text-sm text-muted mt-1">{t("solo.lines.list.subtitle", { count: items.length })}</p>
        </div>
        <Link
          to="/solo/lines/new"
          className="rounded-md bg-primary text-bg px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {t("solo.overview.lines.create")}
        </Link>
      </header>

      <div className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid">
        {items.map((line) => (
          <div key={line.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2">
            <span className="text-2xl shrink-0">{line.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-heading">{line.name}</div>
              <div className="text-[11px] text-muted truncate">{line.description}</div>
            </div>
            <div className="text-xs text-muted shrink-0 w-20 text-right">
              {line.dept_ids.length} 组
            </div>
            <div className="text-xs shrink-0 w-20 text-right">
              <span className="text-spark-mint">¥{(line.revenue_30d ?? 0).toLocaleString()}</span>
            </div>
            <Link to={`/solo/l/${line.id}/`} className="text-xs text-primary hover:underline shrink-0">
              {t("solo.overview.lines.enter")}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
