import { useEffect, useRef, useState } from "react";
import type { TaskEvent } from "../lib/tasks";

/** Subscribe after the trusted snapshot; deduplicate replayed event sequences. */
export function useTaskEvents(base: string, taskId: string, onEvent: (event?: TaskEvent) => void, snapshotCursor?: number) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "reconnecting">("idle");
  useEffect(() => {
    if (!taskId) { setConnection("idle"); return; }
    const key = `task-event:${base}:${taskId}`;
    let cursor = Math.max(snapshotCursor || 0, Number(sessionStorage.getItem(key) || 0));
    setConnection("connecting");
    const source = new EventSource(`${import.meta.env.VITE_API_BASE || ""}${base}/tasks/${taskId}/events?after=${cursor}`, { withCredentials: true });
    source.onopen = () => { setConnection("connected"); callback.current(); };
    source.onerror = () => setConnection("reconnecting");
    source.addEventListener("task", (event) => {
      const message = event as MessageEvent;
      const seq = Number(message.lastEventId);
      if (seq && seq <= cursor) return;
      let row: TaskEvent;
      try { row = JSON.parse(message.data); } catch { return; }
      if (seq) { cursor = seq; sessionStorage.setItem(key, String(cursor)); }
      callback.current({ ...row, ...(seq ? { seq } : {}) });
    });
    return () => source.close();
    // Later snapshots do not require replacing the active EventSource.
  }, [base, taskId]);
  return connection;
}
