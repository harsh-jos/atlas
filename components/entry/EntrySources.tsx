import type { Source } from '@/lib/api-types';
import { cleanTitle } from '@/lib/utils';

export interface EntrySourcesProps {
  sources: Source[];
}

// "https://arxiv.org/abs/1234" -> "arxiv.org" — a quiet host label instead of a raw URL.
function hostLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** One dense line in the footer: label, then linked titles separated by middots. */
export function EntrySources({ sources }: EntrySourcesProps) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[13px] leading-6">
      <span className="shrink-0 font-sans text-xs font-medium text-faint">
        Sources
      </span>
      {sources.map((source, index) => {
        const host = hostLabel(source.url);
        return (
          <span key={`${source.title}-${index}`} className="inline-flex items-baseline">
            {index > 0 && (
              <span className="mr-1.5 text-faint" aria-hidden="true">
                &middot;
              </span>
            )}
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-sm text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
              >
                {cleanTitle(source.title)}
              </a>
            ) : (
              <span className="text-ink">{cleanTitle(source.title)}</span>
            )}
            {host && <span className="ml-1 text-faint">({host})</span>}
          </span>
        );
      })}
    </div>
  );
}
