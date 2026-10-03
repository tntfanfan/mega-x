import type { ReactNode } from "react";
import { chatSegments } from "../../lib/chatProtocol";

/** Body in the normal voice. Optional `<details>` notes sit underneath in gray. */
export function AssistantText({ text, render }: { text: string; render: (part: string) => ReactNode }) {
  const segments = chatSegments(text);
  if (!segments.length) return null;
  return <>
    {segments.map((segment, index) => segment.kind === "text" ? <div key={index}>{render(segment.text)}</div> : (
      <div key={index} className={`whitespace-pre-wrap text-[13px] leading-relaxed text-muted ${index ? "mt-2" : ""}`}>
        {segment.label ? <div>{segment.label}</div> : null}
        {segment.text}
      </div>
    ))}
  </>;
}
