/**
 * LeverageKPI — Solo 仪表盘头部的"杠杆指标"3-5 个大数字。
 *
 * 这是超级个体最爱看的数据：
 *   💰 本月收入 ¥X
 *   📦 产出 Y 份
 *   ⏱ 替代 Z 小时人工
 *   📈 vs 上月 +N%
 *
 * 故意不显示 token 用量 — 那是 Business 的事。
 */

import { useTranslation } from "react-i18next";

export interface LeverageKpiData {
  revenue_30d: number;
  output_count_30d: number;
  hours_saved_30d: number;
  vs_last_month: number;       // 0.35 = +35%; -1 = N/A
  active_lines?: number;
  total_teammates?: number;
}

interface Props {
  data: LeverageKpiData;
  emphasize?: "revenue" | "output" | "hours";   // 哪个数字放大显示
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPct(n: number): string {
  if (n === -1) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${Math.round(n * 100)}%`;
}

export function LeverageKPI({ data, emphasize = "revenue" }: Props) {
  const { t } = useTranslation();
  const cards = [
    {
      key: "revenue",
      label: t("solo.overview.kpi.revenue"),
      value: `¥${fmt(data.revenue_30d)}`,
      icon: "💰",
    },
    {
      key: "output",
      label: t("solo.overview.kpi.output"),
      value: fmt(data.output_count_30d),
      icon: "📦",
    },
    {
      key: "hours",
      label: t("solo.overview.kpi.hours-saved"),
      value: fmt(data.hours_saved_30d) + "h",
      icon: "⏱",
    },
    {
      key: "vs-last",
      label: t("solo.overview.kpi.vs-last"),
      value: fmtPct(data.vs_last_month),
      icon: data.vs_last_month >= 0 ? "📈" : "📉",
      isComparison: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.key}
          className={`rounded-md border bg-surface px-4 py-3 transition-colors ${
            emphasize === c.key
              ? "border-primary bg-primary/5"
              : "border-border-solid"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-lg">{c.icon}</span>
            <span className="text-[10px] tracking-widest uppercase text-muted">{c.label}</span>
          </div>
          <div
            className={`font-display mt-1.5 ${
              emphasize === c.key ? "text-3xl text-primary" : "text-xl text-heading"
            }`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
