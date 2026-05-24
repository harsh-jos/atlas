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
      <div className="rounded-lg border-thin border-zinc-200/70 bg-white p-6">
        <p className="text-sm text-zinc-500">No body content has been written yet.</p>
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-10 border-b-thin border-zinc-200/70 pb-3 text-2xl font-medium leading-8 text-zinc-900 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-10 text-xl font-medium leading-8 text-zinc-900 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-8 text-base font-medium leading-7 text-zinc-900">{children}</h3>
        ),
        p: ({ children }) => <p className="my-5 text-[15px] leading-8 text-zinc-700">{children}</p>,
        ul: ({ children }) => (
          <ul className="my-5 list-disc space-y-2 pl-5 text-[15px] leading-8 text-zinc-700">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-5 list-decimal space-y-2 pl-5 text-[15px] leading-8 text-zinc-700">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-blue-700 underline decoration-blue-200 underline-offset-4 transition-colors hover:text-blue-800"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');

          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-md border-thin border-zinc-200/70 bg-zinc-950 p-4 font-mono text-[13px] leading-6 text-zinc-100">
                {children}
              </code>
            );
          }

          return (
            <code className="rounded border-thin border-zinc-200/70 bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-zinc-800">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="my-6 overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="my-6 border-l-thin border-zinc-300 pl-4 text-zinc-600">
            {children}
          </blockquote>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
