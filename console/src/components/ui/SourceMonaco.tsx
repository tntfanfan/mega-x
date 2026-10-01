import { useId } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { useTranslation } from "react-i18next";

import type { SourceEditorProps } from "./SourceEditorPane";

// ESM assets and workers are bundled by Vite and served from our own origin.
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker();
    if (["typescript", "javascript"].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

monaco.editor.defineTheme("lgh-source", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0D1119",
    "editor.foreground": "#B8AFA0",
    "editorLineNumber.foreground": "#5A6678",
    "editorLineNumber.activeForeground": "#D4A84E",
    "editor.selectionBackground": "#D4A84E33",
    "editor.inactiveSelectionBackground": "#D4A84E1A",
    "editorWidget.background": "#151B28",
    "editorWidget.border": "#2A2438",
  },
});

const LANGUAGES: Record<string, string> = {
  md: "markdown", markdown: "markdown",
  json: "json", jsonc: "json", json5: "json",
  yaml: "yaml", yml: "yaml",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html", svg: "xml", xml: "xml",
  py: "python", sh: "shell", bash: "shell", sql: "sql",
  toml: "ini", ini: "ini", env: "ini",
};

export default function SourceMonaco({ value, path }: SourceEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const name = path.split("/").pop() || path;
  const language = name.toLowerCase() === "dockerfile" ? "dockerfile"
    : LANGUAGES[name.split(".").pop()?.toLowerCase() || ""] || "plaintext";
  // Separate instances/scopes can show the same filename with different text.
  const modelPath = `inmemory://lgh-source/${encodeURIComponent(id)}/${path.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <Editor
      height="100%"
      width="100%"
      value={value}
      path={modelPath}
      language={language}
      theme="lgh-source"
      loading={<p role="status" className="p-4 text-xs text-muted">{t("common.loading")}…</p>}
      options={{
        readOnly: true,
        domReadOnly: true,
        ariaLabel: `${name} · ${t("source.readonly")}`,
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 21,
        lineNumbers: "on",
        minimap: { enabled: false },
        wordWrap: "on",
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        folding: true,
        stickyScroll: { enabled: false },
        renderLineHighlight: "none",
        overviewRulerBorder: false,
        fixedOverflowWidgets: true,
        unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
      }}
    />
  );
}
