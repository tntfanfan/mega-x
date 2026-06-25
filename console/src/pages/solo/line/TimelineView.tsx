/**
 * /solo/l/:lineId/timeline — 该产线的所有动作历史。
 *
 * 数据来自 /v1/lines/:id/activity，但把 dept_id 翻译为"组"，agent 隐藏。
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, ActivityEvent } from "../../../lib/api";
import { lookupGroupLabel } from "../../../lib/fixtures";

type Ctx = { line: Company };

const TYPE_LABEL: Record<ActivityEvent["type"], { emoji: string; tone: string }> = {
  task_received: { emoji: "📥", tone: "text-spark-blue" },
  handoff:       { emoji: "↪️", tone: "text-spark-flare" },
  review_gate:   { emoji: "🔍", tone: "text-spark-flare" },
  task_done:     { emoji: "✅", tone: "text-spark-mint" },
  artifact:      { emoji: "📦", tone: "text-spark-mint" },
  info:          { emoji: "ℹ️", tone: "text-muted" },
};

export default function TimelineView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [items, setItems] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    api.get<{ items: ActivityEvent[] }>(`/v1/lines/${line.id}/activity`).then((r) => setItems(r.items));
  }, [line.id]);

  const sorted = items.slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts));

  return (
    <section className="p-6 space-y-6 max-w-3xl">
      <header>
        <h2 className="font-display text-xl text-heading">{t("solo.line.timeline.title")}</h2>
        <p className="text-sm text-muted">{t("solo.line.timeline.subtitle")}</p>
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">{t("solo.line.timeline.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((evt) => {
            const labels = lookupGroupLabel(line.template_slug, evt.dept_id);
            const groupLabel = labels ? t(labels.label_key) : evt.dept_id;
            const meta = TYPE_LABEL[evt.type];
            return (
              <li key={evt.id} className="rounded-md border border-border-solid bg-surface px-4 py-3 flex items-start gap-3">
                <span className="text-lg shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-body">{evt.text}</div>
                  <div className="text-[10px] text-muted mt-0.5 flex items-center gap-2">
                    <span>{new Date(evt.ts).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "2-digit", day: "2-digit" })}</span>
                    <span>·</span>
                    <span className="text-primary">{groupLabel}</span>
                  </div>
                </div>
                <span className={`text-[10px] ${meta.tone} shrink-0`}>{evt.type}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
