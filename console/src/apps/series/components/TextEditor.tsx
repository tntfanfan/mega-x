import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import type { Version } from "../api";
import { shortVersion } from "../stages";

/**
 * 在页面上直接改一版文字。保存 = 存成一个新的草稿版本（原版本不动），
 * 依赖、媒体、范围都沿用原版本；「保存并设为生效」顺手把新版本设为生效。
 */
export function TextEditor({ version, saving, error, onCancel, onSave, onDirty }: {
  version: Version;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (body: string, fields: string, thenCanonical: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const initialBody = version.body ?? "";
  const initialFields = version.fields ?? "";
  const [body, setBody] = useState(initialBody);
  const [fields, setFields] = useState(initialFields);
  const [showFields, setShowFields] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = body !== initialBody || fields !== initialFields;

  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => { area.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = (thenCanonical: boolean) => { if (!saving && body.trim()) onSave(body, fields, thenCanonical); };
  const cancel = () => { if (!dirty || window.confirm("放弃这次修改？")) onCancel(); };
  const keys = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(false); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
  };

  return (
    <div onKeyDown={keys} className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">基于 {shortVersion(version.ref)} 修改 · 保存后是新的草稿，{shortVersion(version.ref)} 原样保留</span>
        <span className="ms-auto tabular-nums text-dim">{body.length} 字</span>
      </div>
      <textarea ref={area} aria-label="正文" value={body} onChange={e => setBody(e.target.value)} spellCheck={false}
        className="min-h-[50vh] w-full flex-1 resize-y rounded-lg border border-border-solid bg-surface px-4 py-3 text-sm leading-7 text-heading outline-none transition-colors focus:border-primary/60" />
      {initialFields && (
        <div className="rounded-lg border border-border-solid bg-surface/60">
          <button type="button" onClick={() => setShowFields(s => !s)} aria-expanded={showFields}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-muted hover:text-heading">
            {showFields ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
            字段<span className="text-dim">（标题、标签这类结构化信息，YAML）</span>
            {fields !== initialFields && <span className="ms-auto text-spark-blue">已改</span>}
          </button>
          {showFields && (
            <textarea aria-label="字段" value={fields} onChange={e => setFields(e.target.value)} spellCheck={false}
              rows={Math.min(12, Math.max(3, fields.split("\n").length + 1))}
              className="block w-full resize-y border-t border-border-solid bg-transparent px-3 py-2 font-mono text-xs leading-5 text-body outline-none" />
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-fusion">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-bg/90 py-2 backdrop-blur">
        <button type="button" onClick={cancel} disabled={saving}
          className="rounded-md border border-border-solid px-3 py-1.5 text-xs text-body hover:border-primary disabled:opacity-40">取消 <kbd className="ms-1 text-dim">Esc</kbd></button>
        <span className="flex-1" />
        <button type="button" onClick={() => save(false)} disabled={saving || !dirty || !body.trim()}
          title="存成新的草稿版本（⌘/Ctrl+S）"
          className="inline-flex items-center gap-1 rounded-md border border-primary/60 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-40">
          {saving && <LoaderCircle size={12} aria-hidden className="animate-spin" />}保存为新版本 <kbd className="ms-1 text-primary/60">⌘S</kbd>
        </button>
        <button type="button" onClick={() => save(true)} disabled={saving || !dirty || !body.trim()}
          title="存成新版本并设为生效（⌘/Ctrl+Enter）"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent disabled:opacity-40">保存并设为生效</button>
      </div>
    </div>
  );
}
