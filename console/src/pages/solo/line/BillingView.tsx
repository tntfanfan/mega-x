/**
 * /solo/l/:lineId/billing — 该产线的杠杆指标 + 订阅档位。
 *
 * Solo 计费 UI 哲学：不秀 token，秀"赚了多少 / 省了多少 / 产了多少"。
 */

import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Company } from "../../../lib/api";
import { LeverageKPI } from "../../../components/solo/LeverageKPI";

type Ctx = { line: Company };

const PLANS = [
  { slug: "free", recommended: false },
  { slug: "pro", recommended: true },
  { slug: "elite", recommended: false },
];

export default function BillingView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();

  return (
    <section className="p-6 space-y-6 max-w-4xl">
      <header>
        <h2 className="font-display text-xl text-heading">{t("solo.line.billing.title")}</h2>
        <p className="text-sm text-muted">{t("solo.line.billing.subtitle")}</p>
      </header>

      {/* Leverage KPI for this line */}
      <LeverageKPI
        data={{
          revenue_30d: line.revenue_30d ?? 0,
          output_count_30d: line.output_count_30d ?? 0,
          hours_saved_30d: line.hours_saved_30d ?? 0,
          vs_last_month: line.vs_last_month ?? 0,
        }}
        emphasize="revenue"
      />

      {/* Plan picker */}
      <section className="pt-6 border-t border-border-solid space-y-3">
        <h3 className="font-display text-base text-heading">{t("solo.line.billing.plan.title")}</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.slug}
              className={`rounded-md border p-4 space-y-2 ${
                p.recommended ? "border-primary bg-primary/5" : "border-border-solid bg-surface"
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm text-heading">{t(`solo.plan.${p.slug}.name`)}</h4>
                {p.recommended && (
                  <span className="text-[10px] tracking-widest uppercase text-primary">推荐</span>
                )}
              </div>
              <div className="text-xl text-primary font-display">{t(`solo.plan.${p.slug}.price`)}</div>
              <p className="text-[11px] text-muted leading-relaxed">{t(`solo.plan.${p.slug}.body`)}</p>
              <button
                type="button"
                className={`w-full text-xs py-1.5 rounded font-medium transition-colors ${
                  p.recommended
                    ? "bg-primary text-bg hover:bg-accent"
                    : "border border-border-solid text-body hover:border-primary hover:text-primary"
                }`}
              >
                {p.recommended ? t("solo.line.billing.plan.upgrade") : "选择"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
