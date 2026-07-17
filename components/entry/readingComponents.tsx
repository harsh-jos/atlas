import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';

// A fenced block is a <code> that either carries a language class or spans lines.
function isBlockCode(className: string | undefined, children: ReactNode): boolean {
  return /language-/.test(className ?? '') || String(children).includes('\n');
}

// The shared element styling for reading content — used for both markdown
// (MarkdownBody) and hand-authored HTML (HtmlBody), so the two look identical.
export const readingComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-14 mb-5 border-b-thin pb-2.5 font-title text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-12 mb-4 font-title text-[21px] font-semibold leading-snug tracking-[-0.015em] text-ink first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-9 mb-3 font-title text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-7 mb-2 font-title text-[15px] font-semibold text-ink">{children}</h4>
  ),
  p: ({ children }) => <p className="my-5 text-[18px] leading-[1.75] text-body">{children}</p>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-5 list-disc space-y-2 pl-5 text-[18px] leading-[1.7] text-body marker:text-faint">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-5 list-decimal space-y-2 pl-5 text-[18px] leading-[1.7] text-body marker:text-faint">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-accent underline decoration-accent/30 underline-offset-[3px] transition-colors hover:decoration-accent"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) =>
    isBlockCode(className, children) ? (
      <code className="font-mono text-ink">{children}</code>
    ) : (
      <code className="rounded-md border-thin bg-surface-soft px-1.5 py-0.5 font-mono text-[14px] text-ink">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto rounded-xl border-thin bg-surface-soft p-4 font-mono text-[13px] leading-6 text-ink">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-7 rounded-r-lg border-l-[3px] border-accent/40 bg-surface-soft/60 py-1 pl-5 pr-4 text-[18px] leading-[1.7] text-muted [&>p]:my-2.5">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-0 border-t-thin" />,
  table: ({ children }) => (
    <div className="my-7 overflow-x-auto rounded-xl border-thin">
      <table className="w-full border-collapse text-[15px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-soft">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b-thin px-4 py-2.5 text-left font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b-thin px-4 py-2.5 align-top leading-relaxed text-body">{children}</td>
  ),
  img: ({ src, alt }) => (
    <span className="my-8 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={typeof src === 'string' ? src : ''}
        alt={alt ?? ''}
        className="block w-full rounded-card border-thin"
      />
      {alt && <span className="mt-2.5 block text-center text-[13px] text-faint">{alt}</span>}
    </span>
  ),
};
