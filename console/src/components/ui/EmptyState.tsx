/**
 * Empty state — a dashed, centered placeholder for "no data yet" surfaces,
 * with an optional emoji, hint line, and call-to-action. Replaces the bare
 * `<p class="text-sm text-muted">…</p>` empties that read as broken/blank.
 */

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-border-solid bg-surface/40 px-6 py-12 text-center">
      {icon && <div className="text-3xl mb-2" aria-hidden>{icon}</div>}
      <p className="text-sm text-body">{title}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
