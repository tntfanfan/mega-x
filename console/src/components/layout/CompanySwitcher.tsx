/**
 * Tenant switcher — dropdown for company (business) or line (solo) shells.
 *
 * Defaults keep the business paths/labels; solo passes itemBasePath=/solo/l etc.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Company } from "../../lib/api";

interface Props {
  current: Company | null;
  companies: Company[];
  /** Prefix for item navigation, without trailing slash. Default: /business/c */
  itemBasePath?: string;
  /** Create CTA path. Default: /business/companies/new */
  createPath?: string;
  labelKey?: string;
  createKey?: string;
  emptyKey?: string;
  countSuffixKey?: string;
}

export function CompanySwitcher({
  current,
  companies,
  itemBasePath = "/business/c",
  createPath = "/business/companies/new",
  labelKey = "shell.switcher.label",
  createKey = "shell.switcher.create",
  emptyKey = "shell.switcher.empty",
  countSuffixKey = "business.overview.company.depts-suffix",
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-display text-lg text-heading hover:text-primary transition-colors min-w-0"
      >
        <span className="truncate max-w-[24ch]">
          {current ? current.name : t(labelKey)}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute start-0 top-full mt-2 w-72 rounded-md border border-border-solid bg-surface-2 shadow-glass z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] tracking-widest uppercase text-muted border-b border-border-solid">
            {t(labelKey)} · {companies.length}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {companies.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted">{t(emptyKey)}</li>
            ) : (
              companies.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (c.id !== current?.id) navigate(`${itemBasePath}/${c.id}/`);
                    }}
                    className={`w-full text-start flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      c.id === current?.id
                        ? "bg-primary/10 text-primary"
                        : "text-body hover:bg-surface-3 hover:text-primary"
                    }`}
                  >
                    <span className="text-base shrink-0">{c.emoji}</span>
                    <span className="truncate flex-1">{c.name}</span>
                    <span className="text-[10px] text-muted shrink-0">
                      {c.dept_ids.length}
                      {t(countSuffixKey)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(createPath);
            }}
            className="w-full px-3 py-2 text-start text-sm text-primary hover:bg-surface-3 border-t border-border-solid"
          >
            {t(createKey)}
          </button>
        </div>
      )}
    </div>
  );
}
