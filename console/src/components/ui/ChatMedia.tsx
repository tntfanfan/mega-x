import { useState } from "react";
import { useTranslation } from "react-i18next";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

function mediaSrc(value: string): string | null {
  const source = value.trim();
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith("/v1/")) return `${API_BASE.replace(/\/$/, "")}${source}`;
  return null;
}

function ChatImage({ src }: { src: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
        {t("common.preview.media-error")}
      </a>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block w-fit max-w-full">
      <img
        src={src}
        alt={t("artifact.type.image")}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-w-full max-h-96 rounded-md border border-border-solid object-contain"
      />
    </a>
  );
}

/** Media attached to an OpenClaw reply, separate from its Markdown text. */
export function ChatMedia({ media }: { media?: string[] }) {
  const urls = [...new Set((media || []).map(mediaSrc).filter((url): url is string => Boolean(url)))];
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {urls.map((url) => /\.mp4(?:[?#]|$)/i.test(url)
        ? <video key={url} src={url} controls playsInline preload="metadata" className="max-h-96 max-w-full rounded-md border border-border-solid" />
        : <ChatImage key={url} src={url} />)}
    </div>
  );
}
