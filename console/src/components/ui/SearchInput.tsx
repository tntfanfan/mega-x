/**
 * SearchInput — compact search box used by the list/grid pages. Magnifier
 * affordance on the left, an inline clear button when non-empty.
 */

import { useTranslation } from "react-i18next";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-xs text-dim" aria-hidden>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? t("common.search")}
        className="w-full bg-surface border border-border-solid rounded ps-7 pe-7 py-1.5 text-sm text-body placeholder:text-dim focus:border-primary outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clear-search")}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 text-dim hover:text-primary text-xs px-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}
