/** 网剧应用里到处用的小零件：状态标签、弹出菜单、产出物图标。 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen, Clapperboard, FileText, Film, Image as ImageIcon, LayoutGrid, Library, ScrollText, ShieldCheck, Users, Video,
} from "lucide-react";

export type Tone = "canonical" | "draft" | "stale" | "deprecated" | "newer";

const PILL: Record<Tone, { text: string; cls: string; dot: string }> = {
  canonical: { text: "生效", cls: "border-spark-mint/40 bg-spark-mint/10 text-spark-mint", dot: "bg-spark-mint" },
  draft: { text: "草稿", cls: "border-border-solid bg-surface-2 text-muted", dot: "bg-muted" },
  stale: { text: "过期", cls: "border-spark-flare/40 bg-spark-flare/10 text-spark-flare", dot: "bg-spark-flare" },
  deprecated: { text: "弃用", cls: "border-border-solid bg-transparent text-dim line-through", dot: "bg-dim" },
  newer: { text: "有新稿", cls: "border-spark-blue/40 bg-spark-blue/10 text-spark-blue", dot: "bg-spark-blue" },
};

export function toneOf(status: string): Tone {
  return status === "canonical" || status === "stale" || status === "deprecated" ? status : "draft";
}

export function StatusPill({ tone, children, title }: { tone: Tone; children?: ReactNode; title?: string }) {
  const p = PILL[tone];
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] leading-4 ${p.cls}`}>
      {children ?? p.text}
    </span>
  );
}

export function StatusDot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${PILL[tone].dot} ${className}`} />;
}

const KIND_ICON: Record<string, typeof BookOpen> = {
  bible: BookOpen, outline: ScrollText, arc: ScrollText, reference: Library, novel: FileText, script: FileText,
  profile: Users, abilities: Users, concept: ImageIcon, storyboard: LayoutGrid, "shot-list": Clapperboard,
  clip: Video, cut: Film, review: ShieldCheck,
};

export function KindIcon({ kind, size = 16, className = "" }: { kind: string; size?: number; className?: string }) {
  const Icon = KIND_ICON[kind] || FileText;
  return <Icon size={size} aria-hidden className={className} />;
}

/**
 * A button that opens a floating panel below it. Closes on outside click, Esc, or `close()` from the panel.
 * `align` = which edge of the trigger the panel lines up with.
 */
export function Popover({ trigger, label, disabled, title, align = "start", side = "bottom", className = "", children }: {
  trigger: ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // Keep the panel on screen: nudge it sideways when the trigger sits near an edge (narrow screens).
  useLayoutEffect(() => {
    if (!open || !panel.current) { setShift(0); return; }
    const r = panel.current.getBoundingClientRect();
    const gap = 8;
    setShift(r.right > window.innerWidth - gap ? window.innerWidth - gap - r.right : r.left < gap ? gap - r.left : 0);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return (
    <div ref={root} className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={title} disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${open ? "bg-surface-2" : ""} ${className}`}>
        {trigger}
      </button>
      {open && (
        <div ref={panel} role="menu" style={shift ? { translate: `${shift}px 0` } : undefined} className={`absolute z-40 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border-solid bg-surface-2 shadow-xl animate-in fade-in ${side === "top" ? "bottom-full mb-1 slide-in-from-bottom-1" : "top-full mt-1 slide-in-from-top-1"} ${align === "end" ? "end-0" : "start-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} title={title}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-3 ${active ? "text-primary" : "text-body"}`}>
      {children}
    </button>
  );
}

/** Keyboard shortcuts should leave typing alone. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
