import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export interface MarkdownBodyProps {
  body: string | null;
}

export function MarkdownBody({ body }: MarkdownBodyProps) {
  if (!body?.trim()) {
    return (
      <div className="rounded-2xl border-thin bg-surface p-6">
        <p className="text-sm text-muted">No body content has been written yet.</p>
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-12 border-b-thin pb-3 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-11 text-[21px] font-semibold leading-snug tracking-[-0.015em] text-ink first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-8 text-[17px] font-semibold leading-snug text-ink">{children}</h3>
        ),
        p: ({ children }) => <p className="my-5 text-[17px] leading-[1.6] text-body">{children}</p>,
        ul: ({ children }) => (
          <ul className="my-5 list-disc space-y-2 pl-5 text-[17px] leading-[1.6] text-body marker:text-faint">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-5 list-decimal space-y-2 pl-5 text-[17px] leading-[1.6] text-body marker:text-faint">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-accent underline decoration-accent/30 underline-offset-[3px] transition-colors hover:decoration-accent"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');

          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-xl bg-[#1d1d1f] p-4 font-mono text-[13px] leading-6 text-zinc-100">
                {children}
              </code>
            );
          }

          return (
            <code className="rounded-md border-thin bg-surface-soft px-1.5 py-0.5 font-mono text-[14px] text-ink">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="my-6 overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="my-6 border-l-2 border-[var(--hairline-strong,#d2d2d7)] pl-4 text-muted">
            {children}
          </blockquote>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
