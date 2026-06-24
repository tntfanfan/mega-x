/**
 * ComingSoon — placeholder for not-yet-built routes (DevHome, Admin review
 * queue, Conversations). Previously these rendered a plain bordered box of
 * muted text that was visually indistinguishable from a real-but-empty data
 * surface, so users couldn't tell "nothing here yet" from "feature not built".
 *
 * This makes the not-built state unmistakable: a dashed accent border, a
 * "建设中" badge (optionally with a roadmap stage like "S4"), and an optional
 * list of planned capabilities.
 */

import { useTranslation } from "react-i18next";

export function ComingSoon({
  title,
  description,
  stage,
  planned,
  badge,
}: {
  title: string;
  description?: string;
  stage?: string;
  planned?: string[];
  badge?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/[0.03] px-6 py-14 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-fusion/40 bg-fusion/10 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-fusion">
        {badge ?? t("ui.coming-soon.badge")}{stage ? ` · ${stage}` : ""}
      </div>
      <h2 className="font-display text-xl text-heading mt-4">{title}</h2>
      {description && <p className="text-sm text-muted mt-1.5 max-w-md mx-auto leading-relaxed">{description}</p>}
      {planned && planned.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {planned.map((p) => (
            <li key={p} className="rounded border border-border-solid bg-surface px-2.5 py-1 text-[11px] text-body">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
