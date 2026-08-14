'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const COPIED_RESET_MS = 1500;

// A fenced block is a <code> that either carries a language class or spans lines —
// same heuristic as the article renderer, kept local since chat code blocks also need a copy button.
function isBlockCode(className: string | undefined, children: ReactNode): boolean {
  return /language-/.test(className ?? '') || String(children).includes('\n');
}

function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className ?? '')?.[1];

  const copy = () => {
    void navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <div className="my-3 overflow-hidden rounded-card border bg-surface-soft first:mt-0 last:mb-0">
      <div className="flex items-center justify-between border-b bg-surface px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="focus-ring flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] text-faint transition-colors hover:bg-surface-soft hover:text-ink"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-ink">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// Deliberately denser than components/entry/readingComponents.tsx — that's for a full
// article measure, this is for a ~65ch chat bubble where every extra px of margin compounds.
const chatMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="my-3 text-[15px] leading-[1.65] text-ink first:mt-0 last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h2 className="mb-2 mt-5 text-[17px] font-semibold leading-snug text-ink first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 mt-5 text-[16px] font-semibold leading-snug text-ink first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1.5 mt-4 text-[15px] font-semibold text-ink first:mt-0">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-[15px] leading-[1.65] text-ink marker:text-faint first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-[1.65] text-ink marker:text-faint first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="focus-ring rounded-sm text-accent underline decoration-accent/30 underline-offset-[3px] transition-colors hover:decoration-accent"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  code: ({ className, children }) =>
    isBlockCode(className, children) ? (
      <CodeBlock className={className}>{children}</CodeBlock>
    ) : (
      <code className="rounded-[4px] border bg-surface-soft px-1.5 py-0.5 font-mono text-[13px] text-ink">
        {children}
      </code>
    ),
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-hairline-strong pl-3.5 text-[15px] leading-[1.65] text-muted first:mt-0 last:mb-0 [&>p]:my-1.5">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-0 border-t" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-card border first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-soft">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-3 py-2 text-left font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-3 py-2 align-top text-ink">{children}</td>,
};

export interface ChatMarkdownProps {
  text: string;
}

/** Renders assistant replies as markdown — GFM tables/strikethrough, math, fenced code with copy. */
export function ChatMarkdown({ text }: ChatMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={chatMarkdownComponents}
    >
      {text}
    </ReactMarkdown>
  );
}
