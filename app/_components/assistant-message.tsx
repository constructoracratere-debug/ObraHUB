"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders an AI assistant response as markdown, styled to match ObraHub's
 * dark theme. Supports bold, lists, inline code, headings, and blockquotes —
 * the elements the NSR-10 assistant tends to emit (page citations, section
 * numbers, technical values like f'c=28 MPa).
 */
export function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="obrahub-prose text-sm leading-relaxed text-slate-300">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold text-white first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold text-white first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1.5 text-sm font-semibold text-white first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0 whitespace-pre-wrap break-words">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="break-words pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="text-slate-200">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[0.85em] text-blue-300 break-all">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-blue-500/30 pl-3 text-slate-400">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline decoration-blue-500/30 underline-offset-2 hover:text-blue-300 break-all"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-white/[0.08]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
