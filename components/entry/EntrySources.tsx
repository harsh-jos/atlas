import type { Source, SourceType } from '@prisma/client';

export interface EntrySourcesProps {
  sources: Source[];
}

const sourceLabels: Record<SourceType, string> = {
  BOOK: 'Book',
  PAPER: 'Paper',
  DOCS: 'Docs',
  TUTORIAL: 'Tutorial',
  COURSE: 'Course',
  WEBSITE: 'Website',
};

/**
 * Sources rendered as a book's references — a quiet numbered list at the end
 * of the entry, not a card competing with the body.
 */
export function EntrySources({ sources }: EntrySourcesProps) {
  if (sources.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
        Sources
      </h2>
      <ol className="space-y-3">
        {sources.map((source, index) => {
          const detail = [sourceLabels[source.sourceType], source.author, source.ref]
            .filter(Boolean)
            .join(' · ');

          return (
            <li key={source.id} className="flex gap-3 text-[14px] leading-6">
              <span className="shrink-0 pt-px font-mono text-[12px] tabular-nums text-faint">
                {index + 1}
              </span>
              <div className="min-w-0">
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-ink underline decoration-[var(--hairline)] underline-offset-[3px] transition-colors hover:decoration-accent"
                  >
                    {source.title}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{source.title}</span>
                )}
                {detail && <span className="text-muted"> — {detail}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
