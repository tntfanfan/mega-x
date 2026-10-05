import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";

export type WorkspaceAvailability = {
  title: string;
  detail: string;
  waiting?: boolean;
  attempt?: number;
  onRetry?: () => void;
};

export function WorkspaceAvailabilityGate({ ready, title, detail, waiting = true, attempt, onRetry, children }: WorkspaceAvailability & {
  ready: boolean;
  children: ReactNode;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (ready || !waiting) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [ready, waiting, title, attempt]);

  return <div data-workspace-gate className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden" aria-busy={!ready && waiting}>
    <div ref={node => node?.toggleAttribute("inert", !ready)} aria-disabled={!ready}
      className={`flex min-h-0 min-w-0 flex-1 ${ready ? "" : "pointer-events-none select-none opacity-20 grayscale"}`}>
      {children}
    </div>
    {!ready && <div data-workspace-loading className="absolute inset-0 z-40 flex items-center justify-center bg-bg/80 px-6">
      <div role="status" aria-live="polite" className="flex max-w-md flex-col items-center text-center">
        {waiting ? <LoaderCircle size={64} strokeWidth={1.5} aria-hidden className="mb-6 animate-spin text-primary" />
          : <CircleAlert size={64} strokeWidth={1.5} aria-hidden className="mb-6 text-muted" />}
        <p className="text-lg font-medium text-heading">{title}</p>
        <p className="mt-3 text-sm leading-6 text-muted">{detail}</p>
        {waiting && <p data-workspace-wait aria-live="off" className="mt-3 text-xs tabular-nums text-muted">
          本阶段已等待 {elapsed} 秒{attempt ? ` · 第 ${attempt} 次连接` : ""}
        </p>}
        {onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-md border border-border-solid bg-surface px-4 py-2 text-sm text-body hover:bg-surface-2 hover:text-heading">
          <RefreshCw size={15} aria-hidden />重新检查
        </button>}
      </div>
    </div>}
  </div>;
}
