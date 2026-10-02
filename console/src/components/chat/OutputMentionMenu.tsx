import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OutputFile } from "../../lib/outputs";
import { useOutputInteractions } from "../outputs/OutputInteractionProvider";

export function OutputMentionMenu({ query, onSelect, activeIndex, onIndex, onResults }: {
  query: string; onSelect: (file: OutputFile) => void; activeIndex: number; onIndex: (index: number) => void;
  onResults: (files: OutputFile[]) => void;
}) {
  const { t } = useTranslation();
  const { searchOutputs, refresh } = useOutputInteractions();
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const offset = useRef(0);
  const sequence = useRef(0);
  const searchRef = useRef(searchOutputs);
  const resultRef = useRef(onResults);
  searchRef.current = searchOutputs;
  resultRef.current = onResults;

  useEffect(() => { void refresh().catch(() => {}); }, []);
  useEffect(() => {
    const seq = ++sequence.current;
    setLoading(true); setError(false); setFiles([]); resultRef.current([]); offset.current = 0;
    const timer = window.setTimeout(() => {
      searchRef.current(query).then(page => {
        if (seq !== sequence.current) return;
        setFiles(page.items); setMore(page.has_more); offset.current = 20;
        resultRef.current(page.items); onIndex(0);
      }).catch(() => { if (seq === sequence.current) setError(true); })
        .finally(() => { if (seq === sequence.current) setLoading(false); });
    }, 200);
    return () => { sequence.current++; window.clearTimeout(timer); };
  }, [query]);

  const loadMore = async () => {
    const seq = sequence.current;
    setLoading(true);
    try {
      const page = await searchRef.current(query, offset.current);
      if (seq !== sequence.current) return;
      offset.current += 20;
      const paths = new Set(files.map(file => file.path));
      const next = [...files, ...page.items.filter(file => !paths.has(file.path))];
      setFiles(next); setMore(page.has_more); resultRef.current(next);
    } catch { if (seq === sequence.current) setError(true); }
    finally { if (seq === sequence.current) setLoading(false); }
  };

  return <div className="absolute bottom-full start-0 z-30 mb-2 max-h-72 w-full overflow-auto rounded-md border border-border-solid bg-surface p-1 shadow-xl">
    <div id="output-mention-list" role="listbox" aria-label={t("outputs.refs.search")}>
      {files.map((file, index) => <button key={file.path} id={`output-mention-${index}`} role="option" type="button"
        aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()} onClick={() => onSelect(file)}
        className={`block w-full rounded px-3 py-2 text-start text-xs ${index === activeIndex ? "bg-primary/10 text-primary" : "text-body hover:bg-surface-2"}`}>
        <span className="block truncate">{file.name}</span><span className="block truncate text-[10px] text-muted">{file.path}</span>
      </button>)}
    </div>
    {loading && <p role="status" className="p-2 text-xs text-muted">{t("common.loading")}…</p>}
    {error && <p role="alert" className="p-2 text-xs text-fusion">{t("outputs.refs.search-error")}</p>}
    {!loading && !error && !files.length && <p role="status" className="p-2 text-xs text-muted">{t(query ? "outputs.no-matches" : "outputs.empty")}</p>}
    {more && !loading && <button type="button" onClick={() => void loadMore()} className="w-full p-2 text-xs text-primary">{t("outputs.refs.more")}</button>}
  </div>;
}
