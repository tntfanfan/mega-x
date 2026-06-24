/**
 * Company switcher — dropdown used in two places:
 *  - CompanyHeader（公司沉浸视图顶栏）：当前公司名作触发，下拉切换
 *  - ConsoleShell TopBar 全局位（已登录但未进任何公司时显示"选公司"按钮）
 *
 * 行为：
 *  - 点公司 → 跳到 /business/c/:id/
 *  - "+ 创建新公司" → /business/companies/new
 *  - 点公司名（已激活）→ 关闭面板
 *  - Esc / click outside → 关闭
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Company } from "../../lib/api";

interface Props {
  current: Company | null;            // 当前公司（沉浸视图传入），全局 TopBar 传 null
  companies: Company[];
}

export function CompanySwitcher({ current, companies }: Props) {
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
          {current ? current.name : t("shell.switcher.label")}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute start-0 top-full mt-2 w-72 rounded-md border border-border-solid bg-surface-2 shadow-glass z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] tracking-widest uppercase text-muted border-b border-border-solid">
            {t("shell.switcher.label")} · {companies.length}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {companies.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted">{t("shell.switcher.empty")}</li>
            ) : (
              companies.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (c.id !== current?.id) navigate(`/business/c/${c.id}/`);
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
                      {c.dept_ids.length}{t("business.overview.company.depts-suffix")}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate("/business/companies/new"); }}
            className="w-full px-3 py-2 text-start text-sm text-primary hover:bg-surface-3 border-t border-border-solid"
          >
            {t("shell.switcher.create")}
          </button>
        </div>
      )}
    </div>
  );
}
