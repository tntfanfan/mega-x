import { useEffect, useRef } from "react";

/** Poll while the page is visible. `active` shortens the interval. */
export function usePoll(fn: () => void, activeMs: number, idleMs: number, active: boolean, key?: string) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === "visible") saved.current();
      timer = window.setTimeout(tick, active ? activeMs : idleMs);
    };
    if (document.visibilityState === "visible") saved.current();
    timer = window.setTimeout(tick, active ? activeMs : idleMs);
    const onVis = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active, activeMs, idleMs, key]);
}
