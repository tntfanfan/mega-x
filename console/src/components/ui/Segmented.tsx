/**
 * Segmented — a row of pill filters (state / source / category). Single-select.
 * Selected pill takes the gold-tinted active treatment used elsewhere
 * (`bg-primary/10 border-primary text-primary`).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count, e.g. "进行中 · 3". */
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex flex-wrap gap-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${
              active
                ? "bg-primary/10 border-primary text-primary"
                : "bg-surface border-border-solid text-body hover:border-primary"
            }`}
          >
            {o.label}
            {o.count != null && <span className="ms-1 text-[10px] opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
