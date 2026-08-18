import { useCallback } from "react";

export function loadPaneWidth(key: string, min: number, max: number, fallback: number): number {
  const saved = Number(localStorage.getItem(key));
  return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback;
}

/** side: 该栏贴在容器的哪一侧（start = 最左栏拖右边缘，end = 最右栏拖左边缘）。 */
export function usePaneResize(
  width: number,
  setWidth: (w: number) => void,
  opts: { key: string; min: number; max: number; side: "start" | "end" },
) {
  const { key, min, max, side } = opts;
  return useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    const dir = (side === "start" ? 1 : -1) * (rtl ? -1 : 1);
    const clamp = (ev: PointerEvent) =>
      Math.min(max, Math.max(min, startW + dir * (ev.clientX - startX)));
    const onMove = (ev: PointerEvent) => setWidth(clamp(ev));
    const onUp = (ev: PointerEvent) => {
      localStorage.setItem(key, String(Math.round(clamp(ev))));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [width, setWidth, key, min, max, side]);
}
