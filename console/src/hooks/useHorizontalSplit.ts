import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

/** A persisted, keyboard-accessible split between the start and end panes. */
export function useHorizontalSplit({
  storageKey,
  initialRatio,
  minStart,
  minEnd,
}: {
  storageKey: string;
  initialRatio: number;
  minStart: number;
  minEnd: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [ratio, setRatio] = useState(() => {
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 0.8 ? saved : initialRatio;
  });

  const bounds = useCallback(() => {
    const available = Math.max((containerRef.current?.clientWidth ?? 1200) - 8, 1);
    const min = Math.max(0.2, minStart / available);
    const max = Math.min(0.8, 1 - minEnd / available);
    return min > max ? { min: 0.5, max: 0.5 } : { min, max };
  }, [minStart, minEnd]);

  const clamp = useCallback((value: number) => {
    const { min, max } = bounds();
    return Math.min(max, Math.max(min, value));
  }, [bounds]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = containerRef.current;
    if (!element) return;
    cleanupRef.current?.();
    const rect = element.getBoundingClientRect();
    const rtl = getComputedStyle(element).direction === "rtl";
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    let latest = ratio;

    const move = (pointer: PointerEvent) => {
      const offset = rtl ? rect.right - pointer.clientX : pointer.clientX - rect.left;
      latest = clamp(offset / Math.max(rect.width - 8, 1));
      setRatio(latest);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      cleanupRef.current = null;
    };
    const finish = (pointer: PointerEvent) => {
      if (pointer.type === "pointerup") move(pointer);
      window.localStorage.setItem(storageKey, String(latest));
      cleanup();
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", cleanup);
    cleanupRef.current = cleanup;
  }, [ratio, clamp, storageKey]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next = ratio;
    if (event.key === "ArrowRight") next += rtl ? -0.025 : 0.025;
    else if (event.key === "ArrowLeft") next += rtl ? 0.025 : -0.025;
    else if (event.key === "Home") next = bounds().min;
    else if (event.key === "End") next = bounds().max;
    else return;
    event.preventDefault();
    next = clamp(next);
    setRatio(next);
    window.localStorage.setItem(storageKey, String(next));
  }, [ratio, bounds, clamp, storageKey]);

  return { containerRef, ratio, onPointerDown, onKeyDown };
}
