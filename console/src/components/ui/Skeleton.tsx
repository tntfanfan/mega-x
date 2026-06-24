/**
 * Loading skeletons.
 *
 * Before this, list/grid pages rendered their fetched array straight away —
 * during the fetch they showed either nothing or, worse, the empty state
 * (indistinguishable from "loaded but truly empty"). These give each page a
 * shape-matched placeholder so the layout doesn't pop and "loading" reads
 * differently from "empty".
 */

import { useTranslation } from "react-i18next";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} aria-hidden />;
}

/** Placeholder for the bordered, divided row lists (companies / tasks / depts). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-md border border-border-solid bg-surface divide-y divide-border-solid"
      role="status"
      aria-label={t("common.loading")}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for the responsive card grids (outputs / marketplace). */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
      role="status"
      aria-label={t("common.loading")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border-solid bg-surface p-4 space-y-2.5">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}
