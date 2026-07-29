/**
 * Markdown — compact GFM renderer for chat bubbles / previews.
 *
 * Tailwind preflight strips default margins & list styles, so every element
 * gets explicit classes here (no @tailwindcss/typography dependency).
 * react-markdown never uses innerHTML, so LLM output is safe to render.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-heading">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc ps-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ps-4 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="font-display text-sm text-heading mt-2">{children}</h1>,
          h2: ({ children }) => <h2 className="font-display text-sm text-heading mt-2">{children}</h2>,
          h3: ({ children }) => <h3 className="font-semibold text-heading mt-2">{children}</h3>,
          h4: ({ children }) => <h4 className="font-semibold text-heading mt-1">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="border-s-2 border-primary/50 ps-3 text-muted">{children}</blockquote>
          ),
          code: ({ className, children }) => {
            // react-markdown wraps block code in <pre>; inline code has no language class + no newline
            const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
            return isBlock ? (
              <code className={`${className ?? ""} block font-mono text-[11px] leading-relaxed`}>{children}</code>
            ) : (
              <code className="font-mono text-[11px] bg-surface-2 rounded px-1 py-0.5">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-surface-2 border border-border-solid rounded p-2 overflow-x-auto">{children}</pre>
          ),
          hr: () => <hr className="border-border-solid my-2" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="text-[11px] border-collapse w-full">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border-solid px-2 py-1 text-start font-semibold text-heading bg-surface-2">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border-solid px-2 py-1 align-top">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
