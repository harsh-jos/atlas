import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { readingComponents } from '@/components/entry/readingComponents';

export interface HtmlBodyProps {
  html: string;
}

/**
 * Hand-authored HTML rendered through the same styled reading components as
 * markdown. rehype-raw parses the raw HTML into nodes; rehype-sanitize strips
 * anything unsafe (scripts, event handlers, unknown protocols) before render.
 */
export function HtmlBody({ html }: HtmlBodyProps) {
  return (
    <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]} components={readingComponents}>
      {html}
    </ReactMarkdown>
  );
}
