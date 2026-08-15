import { isValidElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

// A fenced block is a <code> that either carries a language class or spans lines.
function isBlockCode(className: string | undefined, children: ReactNode): boolean {
  return /language-/.test(className ?? '') || String(children).includes('\n');
}

// react-markdown's `pre` renderer only sees `children` (the `code` element it wraps),
// so the language — carried by remark/rehype as `language-xxx` on that inner element —
// has to be read back off it here to label the block.
function codeLanguage(preChildren: ReactNode): string | undefined {
  const child = Array.isArray(preChildren) ? preChildren[0] : preChildren;
  if (!isValidElement<{ className?: string }>(child)) return undefined;
  return /language-(\w+)/.exec(child.props.className ?? '')?.[1];
}

// Every size below is calc(basePx * --reading-scale) rather than a plain px value,
// so ReadingSettings can scale the whole article uniformly. Each element states its
// own absolute base rather than inheriting a relative (em) size, so nesting (e.g. a
// <li> inside a <blockquote>) never compounds the scale twice.
const scaled = (basePx: number) => `calc(${basePx}px * var(--reading-scale))`;

// The shared element styling for reading content — used for both markdown
// (MarkdownBody) and hand-authored HTML (HtmlBody), so the two look identical.
export const readingComponents: Components = {
  h1: ({ children }) => (
    <h1
      className="mt-14 mb-5 border-b pb-2.5 font-semibold leading-tight tracking-[-0.02em] text-ink first:mt-0"
      style={{ fontSize: scaled(24) }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      className="mt-12 mb-4 font-semibold leading-snug tracking-[-0.015em] text-ink first:mt-0"
      style={{ fontSize: scaled(22) }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      className="mt-9 mb-3 font-semibold leading-snug tracking-[-0.01em] text-ink"
      style={{ fontSize: scaled(17) }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-7 mb-2 font-semibold text-ink" style={{ fontSize: scaled(15) }}>
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p
      className="my-5 text-ink"
      style={{ fontSize: scaled(17), lineHeight: 'var(--reading-line-height)' }}
    >
      {children}
    </p>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul
      className="my-5 list-disc space-y-2.5 pl-5 text-ink marker:text-faint"
      style={{ fontSize: scaled(17), lineHeight: 'var(--reading-line-height)' }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className="my-5 list-decimal space-y-2.5 pl-5 text-ink marker:text-faint"
      style={{ fontSize: scaled(17), lineHeight: 'var(--reading-line-height)' }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="focus-ring rounded-sm text-accent underline decoration-accent/30 underline-offset-[3px] transition-colors hover:decoration-accent"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) =>
    isBlockCode(className, children) ? (
      <code className="font-mono text-ink">{children}</code>
    ) : (
      <code
        className="rounded-md border bg-surface-soft px-1.5 py-0.5 font-mono text-ink"
        style={{ fontSize: scaled(14) }}
      >
        {children}
      </code>
    ),
  pre: ({ children }) => {
    const language = codeLanguage(children);
    return (
      <div className="my-6 overflow-hidden rounded-card border">
        {language && (
          <div className="border-b bg-surface-soft px-4 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
            {language}
          </div>
        )}
        <pre
          className="overflow-x-auto bg-surface-soft p-4 font-mono leading-6 text-ink"
          style={{ fontSize: scaled(13.5) }}
        >
          {children}
        </pre>
      </div>
    );
  },
  // A pull-quote, not an aside: markdown authors reach for `>` to flag the one
  // sentence worth setting apart, so it's set larger than body text, not just indented.
  blockquote: ({ children }) => (
    <blockquote
      className="my-11 border-l-2 border-hairline-strong pl-6 font-medium tracking-[-0.01em] text-ink [&>p]:my-0"
      style={{ fontSize: scaled(21), lineHeight: 'var(--reading-line-height)' }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-0 border-t" />,
  table: ({ children }) => (
    <div className="my-7 overflow-x-auto rounded-card border">
      <table className="w-full border-collapse" style={{ fontSize: scaled(15) }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-soft">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-4 py-2.5 text-left font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-4 py-2.5 align-top leading-relaxed text-ink">{children}</td>
  ),
  img: ({ src, alt }) => (
    <span className="my-8 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={typeof src === 'string' ? src : ''}
        alt={alt ?? ''}
        className="block w-full rounded-card border"
      />
      {alt && <span className="mt-2.5 block text-center text-[13px] text-faint">{alt}</span>}
    </span>
  ),
};
