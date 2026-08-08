import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { readingComponents } from '@/components/entry/readingComponents';

export interface MarkdownBodyProps {
  body: string | null;
}

export function MarkdownBody({ body }: MarkdownBodyProps) {
  if (!body?.trim()) {
    return (
      <div className="rounded-card border bg-surface-soft p-6">
        <p className="text-sm text-muted">No body content has been written yet.</p>
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={readingComponents}
    >
      {body}
    </ReactMarkdown>
  );
}
