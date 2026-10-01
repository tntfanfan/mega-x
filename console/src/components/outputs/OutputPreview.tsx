import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "../ui/Markdown";
import { SourceEditorPane } from "../ui/SourceEditorPane";
import { fetchMeta, rawUrl, requestPreviewUrl, type OutputFile, type OutputMeta } from "../../lib/outputs";
import type { WorkspaceScope } from "../../lib/workspaceScope";

function TableView({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)|\\t/));
  const head = rows[0] || [];
  const body = rows.slice(1, 501);
  return (
    <div className="overflow-auto max-h-full text-xs">
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 bg-surface">
          <tr>{head.map((cell, i) => <th key={i} className="border border-border-solid px-2 py-1 text-start">{cell}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c} className="border border-border-solid px-2 py-1">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 501 && <p className="text-muted p-2">仅显示前 500 行</p>}
    </div>
  );
}

export function OutputPreview({
  scope,
  file,
  view = "preview",
}: {
  scope: WorkspaceScope;
  file: OutputFile | null;
  view?: "preview" | "source";
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);
  const [meta, setMeta] = useState<OutputMeta | null>(null);
  const [htmlUrl, setHtmlUrl] = useState("");

  useEffect(() => {
    setText("");
    setTextLoading(false);
    setTextError(false);
    setMeta(null);
    setHtmlUrl("");
    if (!file) return;
    let stop = false;
    const textual = ["markdown", "text", "code", "json", "yaml", "table"].includes(file.kind);
    if (textual) {
      setTextLoading(true);
      fetch(rawUrl(scope, file.path))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then((body) => { if (!stop) setText(body.slice(0, 1024 * 1024)); })
        .catch(() => { if (!stop) setTextError(true); })
        .finally(() => { if (!stop) setTextLoading(false); });
    }
    if (file.kind === "html") {
      requestPreviewUrl(scope, file.path).then((url) => { if (!stop) setHtmlUrl(url); }).catch(() => {});
    }
    if (["slides", "doc", "sheet"].includes(file.kind)) {
      const poll = () => fetchMeta(scope, file.path).then((m) => { if (!stop) setMeta(m); }).catch(() => {});
      poll();
      const timer = window.setInterval(poll, 4000);
      return () => { stop = true; window.clearInterval(timer); };
    }
    return () => { stop = true; };
  }, [scope.base, file?.path, file?.kind]);

  if (!file) {
    return <p className="p-4 text-xs text-muted">{t("outputs.select-file")}</p>;
  }
  const src = rawUrl(scope, file.path);
  if (textLoading) return <p className="p-4 text-xs text-muted">{t("common.loading")}…</p>;
  if (textError) return <p className="p-4 text-xs text-muted">{t("outputs.preview-error")}</p>;
  if (file.kind === "markdown" || file.kind === "table") {
    return view === "source" ? <SourceEditorPane value={text} path={file.path} />
      : file.kind === "table" ? <TableView text={text} />
        : <article className="mx-auto max-w-3xl min-w-0 p-4 text-body"><Markdown text={text} variant="article" /></article>;
  }
  if (file.kind === "json" || file.kind === "yaml" || file.kind === "text" || file.kind === "code") {
    return <SourceEditorPane value={text} path={file.path} />;
  }
  if (file.kind === "image") return <div className="flex h-full items-center justify-center p-4"><img src={src} alt={file.name} className="max-h-full max-w-full rounded-md object-contain" /></div>;
  if (file.kind === "video") return <div className="flex h-full items-center justify-center p-4"><video src={src} controls preload="metadata" className="max-h-full max-w-full rounded-md" /></div>;
  if (file.kind === "audio") return <div className="p-4"><audio src={src} controls className="w-full" /></div>;
  if (file.kind === "pdf") return <iframe title={file.name} src={src} className="w-full h-full border-0" />;
  if (file.kind === "html") {
    return htmlUrl
      ? <iframe title={file.name} src={htmlUrl} sandbox="allow-scripts" className="w-full h-full border-0" />
      : <p className="text-xs text-muted p-3">正在准备预览…</p>;
  }
  if (["slides", "doc", "sheet"].includes(file.kind)) {
    if (meta?.preview === "ready" && meta.preview_path) {
      return <iframe title={file.name} src={rawUrl(scope, meta.preview_path)} className="w-full h-full border-0" />;
    }
    if (meta?.preview === "failed" || file.oversize) {
      return <p className="text-xs text-muted p-3">无法生成预览，请下载查看。</p>;
    }
    return <p className="text-xs text-muted p-3">生成预览中…</p>;
  }
  return (
    <div className="p-3 text-xs text-muted">
      <p>{file.name}</p>
      <a className="text-primary" href={rawUrl(scope, file.path, true)}>下载</a>
    </div>
  );
}
