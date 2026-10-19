/** 产出物拖进聊天 = 引用。拖拽的数据是一条 ChatRef。 */

import { useEffect, useState } from "react";
import type { ChatRef } from "./api";

export const REF_MIME = "application/x-series-ref";

export function dragRef(event: React.DragEvent, ref: ChatRef) {
  event.dataTransfer.setData(REF_MIME, JSON.stringify(ref));
  event.dataTransfer.setData("text/plain", ref.ref);
  event.dataTransfer.effectAllowed = "copy";
}

export function readDrop(event: React.DragEvent): ChatRef | null {
  const raw = event.dataTransfer.getData(REF_MIME);
  if (!raw) return null;
  try {
    const ref = JSON.parse(raw) as ChatRef;
    return ref && typeof ref.ref === "string" ? ref : null;
  } catch {
    return null;
  }
}

export function isRefDrag(event: React.DragEvent | DragEvent): boolean {
  return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes(REF_MIME));
}

/** True while one of our refs is being dragged anywhere on the page (the chat shows its drop zone). */
export function useRefDragging(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const start = (e: DragEvent) => { if (isRefDrag(e)) setDragging(true); };
    const stop = () => setDragging(false);
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  return dragging;
}

/** `media?path=%2F…` → the file path, which the project resolves to the version that owns it. */
export function mediaPath(url: string): string {
  const at = url.indexOf("?");
  if (at < 0) return url;
  return new URLSearchParams(url.slice(at + 1)).get("path") || url;
}
