/**
 * Toast notifications — the console's single channel for transient feedback
 * (API success / failure, copy-to-clipboard, downloads started, …).
 *
 * Why this exists: before this, every mutating call site (NewWizard create,
 * TaskNew dispatch, Marketplace install) swallowed failures into
 * `console.error` and the user saw nothing. `useToast()` gives those call
 * sites a one-liner to surface success and — critically — failure.
 *
 *   const toast = useToast();
 *   try { await api.post(...) } catch (e) { toast.error(apiErrorMessage(e)); }
 *
 * Mounted once near the root (see main.tsx). Renders a fixed bottom-right
 * stack; each toast auto-dismisses and is also dismissable by click.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** ms before auto-dismiss; errors linger longer so they aren't missed. */
  duration: number;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let _seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", duration?: number) => {
      const id = ++_seq;
      setItems((cur) => [
        ...cur,
        { id, kind, message, duration: duration ?? (kind === "error" ? 6000 : 3500) },
      ]);
    },
    [],
  );

  // Stable convenience wrappers so consumers can destructure freely.
  const success = useCallback((m: string, d?: number) => toast(m, "success", d), [toast]);
  const error = useCallback((m: string, d?: number) => toast(m, "error", d), [toast]);
  const info = useCallback((m: string, d?: number) => toast(m, "info", d), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      <div
        className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
        role="region"
        aria-label="notifications"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const KIND_STYLE: Record<ToastKind, { border: string; accent: string; icon: string }> = {
  success: { border: "border-spark-mint/40", accent: "text-spark-mint", icon: "✓" },
  error: { border: "border-fusion/50", accent: "text-fusion", icon: "✕" },
  info: { border: "border-primary/40", accent: "text-primary", icon: "ℹ" },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const s = KIND_STYLE[item.kind];
  useEffect(() => {
    const h = setTimeout(onDismiss, item.duration);
    return () => clearTimeout(h);
  }, [item.duration, onDismiss]);

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`flex items-start gap-2.5 w-full text-start rounded-md border ${s.border} bg-surface-2/95 backdrop-blur px-3.5 py-2.5 shadow-glass animate-in fade-in slide-in-from-bottom-2 duration-200`}
    >
      <span className={`shrink-0 text-sm leading-5 ${s.accent}`} aria-hidden>{s.icon}</span>
      <span className="text-xs leading-5 text-body break-words">{item.message}</span>
    </button>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
  return ctx;
}
