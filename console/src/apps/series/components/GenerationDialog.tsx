import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function GenerationDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; const focus = document.activeElement as HTMLElement | null; el?.showModal(); return () => { el?.close(); focus?.focus(); }; }, []);
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }} aria-label={title} className="m-auto max-h-[90dvh] w-[min(58rem,94vw)] rounded-2xl border border-border-solid bg-surface p-0 text-body shadow-2xl backdrop:bg-black/60">
    <div className="flex items-center justify-between border-b border-border-solid px-5 py-4"><h2 className="font-medium text-heading">{title}</h2><button type="button" onClick={onClose} aria-label="关闭设置" className="rounded p-2 hover:bg-surface-2"><X size={18} /></button></div>
    <div className="max-h-[calc(90dvh-5rem)] overflow-y-auto p-5">{children}</div>
  </dialog>;
}
export const fieldClass = "w-full rounded-lg border border-border-solid bg-surface-2 px-3 py-2 text-sm text-heading outline-none focus:border-primary";
export const primaryClass = "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-40";
