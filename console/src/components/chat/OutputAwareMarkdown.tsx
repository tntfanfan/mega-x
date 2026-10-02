import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChatRef } from "../../lib/chatRefs";
import type { OutputFile, OutputMention, OutputNode, ResolvedMention } from "../../lib/outputs";
import { mentionCandidates, mentionKey, outputPathFromLink } from "../../lib/outputRefs";
import { useOutputInteractions } from "../outputs/OutputInteractionProvider";
import { Markdown } from "../ui/Markdown";

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Transform only Markdown text/inline-code nodes; existing links and code blocks stay intact. */
function mentionPlugin(items: OutputMention[]) {
  const values = new Map(items.map(item => [item.value, item]));
  const pattern = new RegExp([...values.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join("|"), "g");
  return () => (tree: MdNode) => {
    if (!items.length) return;
    const walk = (parent: MdNode) => {
      if (["link", "image", "code", "html"].includes(parent.type) || !parent.children) return;
      parent.children = parent.children.flatMap(node => {
        if (node.type !== "text" && node.type !== "inlineCode") { walk(node); return [node]; }
        const value = node.value || "";
        const matches = node.type === "inlineCode" && values.has(value)
          ? [{ 0: value, index: 0 }] : [...value.matchAll(pattern)];
        const out: MdNode[] = [];
        let start = 0;
        for (const match of matches) {
          const index = match.index || 0;
          // Do not turn email addresses or suffixes of ordinary identifiers into links.
          if (/[A-Za-z0-9_@/]/.test(value[index - 1] || "") || /[A-Za-z0-9_]/.test(value[index + match[0].length] || "")) continue;
          if (index > start) out.push({ ...node, value: value.slice(start, index) });
          const item = values.get(match[0])!;
          out.push({ type: "link", url: `?lgh-output-mention=${encodeURIComponent(item.value)}&match=${item.match}`,
            children: [{ ...node, value: match[0] }] });
          start = index + match[0].length;
        }
        if (!out.length) return [node];
        if (start < value.length) out.push({ ...node, value: value.slice(start) });
        return out;
      });
    };
    walk(tree);
  };
}

function filesInTree(nodes: OutputNode[]): OutputNode[] {
  return nodes.flatMap(node => node.kind === "dir" ? filesInTree(node.children || []) : [node]);
}

function MentionLink({ item, result, children, onBind, onRetry }: {
  item: OutputMention; result?: ResolvedMention; children: ReactNode;
  onBind: (file: OutputFile) => void; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { openOutput } = useOutputInteractions();
  const [choosing, setChoosing] = useState(false);
  if (!result || result.status === "invalid" || (result.status === "missing" && item.match === "name")) return <>{children}</>;
  const select = (file: OutputFile) => { onBind(file); setChoosing(false); openOutput(file.path); };
  return <span className="relative inline">
    <button type="button" title={result.status === "resolved" ? result.candidates[0]?.path : t(`outputs.refs.${result.status === "ambiguous" ? "choose" : "not-ready"}`)}
      onClick={() => result.status === "resolved" ? select(result.candidates[0])
        : result.status === "ambiguous" ? setChoosing(v => !v) : onRetry()}
      className="text-primary underline underline-offset-2">{children}</button>
    {choosing && <span role="listbox" aria-label={t("outputs.refs.choose")}
      className="absolute start-0 top-full z-30 mt-1 block max-h-64 min-w-64 overflow-auto rounded border border-border-solid bg-surface p-1 shadow-xl">
      {result.candidates.map(file => <button key={file.path} type="button" role="option" aria-selected={false}
        onClick={() => select(file)} title={file.path} className="block w-full px-2 py-2 text-start text-xs hover:bg-surface-2">
        <span className="block text-heading">{file.name}</span><span className="block break-all text-muted">{file.path}</span>
      </button>)}
      <button type="button" onClick={() => setChoosing(false)} className="block w-full p-1 text-xs text-muted">{t("outputs.refs.close")}</button>
    </span>}
  </span>;
}

export function OutputAwareMarkdown({ text, refs = [], user = false }: { text: string; refs?: ChatRef[]; user?: boolean }) {
  const { scope, nodes, resolveMentions, openOutput, outputRevision } = useOutputInteractions();
  const [results, setResults] = useState<Record<string, ResolvedMention>>({});
  const bindings = useRef(new Map<string, OutputFile>());
  const resolveRef = useRef(resolveMentions);
  resolveRef.current = resolveMentions;
  const items = useMemo(() => {
    const found = new Map(mentionCandidates(text).map(item => [mentionKey(item), item]));
    for (const file of filesInTree(nodes)) {
      for (const value of [file.name, file.path]) if (text.includes(value)) {
        const item: OutputMention = { value, match: value === file.path ? "path" : "name" };
        found.set(mentionKey(item), item);
      }
    }
    for (const [key] of bindings.current) {
      const match = key.startsWith("path:") ? "path" : "name";
      const value = key.slice(match.length + 1);
      if (text.includes(value)) found.set(key, { value, match });
    }
    for (const ref of refs) if (ref.type === "output") {
      for (const value of [ref.label, ref.path.split("/").pop()!, ref.path]) {
        if (text.includes(value)) {
          const item: OutputMention = { value, match: value.includes("/") ? "path" : "name" };
          found.set(mentionKey(item), item);
        }
      }
    }
    return [...found.values()];
  }, [text, nodes, refs]);
  const itemSignature = items.map(mentionKey).join("\n");

  useEffect(() => {
    let stopped = false;
    const needed = items.filter(item => !bindings.current.has(mentionKey(item)));
    const bound: Record<string, ResolvedMention> = {};
    for (const item of needed) {
      const candidates = refs.filter(ref => ref.type === "output" &&
        (item.match === "path" ? ref.path === item.value : ref.label === item.value || ref.path.split("/").pop() === item.value))
        .map(ref => { const r = ref as Extract<ChatRef, { type: "output" }>; return { path: r.path, name: r.label, kind: r.kind || "other" }; });
      if (candidates.length) bound[mentionKey(item)] = { ...item, status: candidates.length > 1 ? "ambiguous" : "resolved", candidates };
    }
    const timer = window.setTimeout(() => {
      const unbound = needed.filter(item => !bound[mentionKey(item)]);
      resolveRef.current(unbound).then(rows => {
        if (stopped) return;
        const next = { ...bound };
        for (const row of rows) next[mentionKey(row)] = row;
        for (const row of Object.values(next)) if (row.status === "resolved") bindings.current.set(mentionKey(row), row.candidates[0]);
        setResults(current => ({ ...current, ...next }));
      }).catch(() => {});
    }, 350);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [itemSignature, outputRevision]);

  const bind = (item: OutputMention, file: OutputFile) => {
    bindings.current.set(mentionKey(item), file);
    setResults(current => ({ ...current, [mentionKey(item)]: { ...item, status: "resolved", candidates: [file] } }));
  };

  const renderItems = items.filter(item => item.match === "path" || bindings.current.has(mentionKey(item)) ||
    ["resolved", "ambiguous"].includes(results[mentionKey(item)]?.status));
  return <Markdown text={text} preserveWhitespace={user} remarkPlugins={[mentionPlugin(renderItems)]}
    renderLink={(href, children) => {
      const path = outputPathFromLink(href, scope, location.origin);
      if (path) return <button type="button" title={path} onClick={() => openOutput(path)} className="text-primary underline underline-offset-2">{children}</button>;
      const match = /^\?lgh-output-mention=([^&]+)&match=(name|path)$/.exec(href);
      if (!match) return undefined;
      const item: OutputMention = { value: decodeURIComponent(match[1]), match: match[2] as OutputMention["match"] };
      const bound = bindings.current.get(mentionKey(item));
      const result = bound ? { ...item, status: "resolved" as const, candidates: [bound] } : results[mentionKey(item)];
      return <MentionLink item={item} result={result} onBind={file => bind(item, file)} onRetry={() => {
        void resolveRef.current([item], true).then(([row]) => {
          setResults(current => ({ ...current, [mentionKey(item)]: row }));
          if (row.status === "resolved") { bind(item, row.candidates[0]); openOutput(row.candidates[0].path); }
        }).catch(() => {});
      }}>{children}</MentionLink>;
    }} />;
}
