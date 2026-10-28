import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatMarkdown({ content }: { content: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-semibold tracking-tight first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h3>,
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
      ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
      li: ({ children }) => <li className="pl-1">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 hover:opacity-70">{children}</a>,
      blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-[var(--tan)] pl-3 italic text-[var(--muted-ink)]">{children}</blockquote>,
      hr: () => <hr className="my-4 border-[var(--line)]" />,
      code: ({ className, children }) => className
        ? <code className="font-mono text-[0.85em]">{children}</code>
        : <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
      pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-xl bg-[var(--ink)] p-3 text-xs leading-relaxed text-[var(--paper)]">{children}</pre>,
      table: ({ children }) => <div className="mb-3 overflow-x-auto rounded-lg border border-[var(--line)]"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
      thead: ({ children }) => <thead className="bg-black/5 font-semibold">{children}</thead>,
      th: ({ children }) => <th className="border-b border-[var(--line)] px-3 py-2">{children}</th>,
      td: ({ children }) => <td className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>;
}
