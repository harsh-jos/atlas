import { BookOpen, FileText, Globe, GraduationCap, MonitorPlay } from 'lucide-react';
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

const sourceIcons = {
  BOOK: BookOpen,
  PAPER: FileText,
  DOCS: FileText,
  TUTORIAL: MonitorPlay,
  COURSE: GraduationCap,
  WEBSITE: Globe,
} satisfies Record<SourceType, typeof FileText>;

export function EntrySources({ sources }: EntrySourcesProps) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em] text-ink">Sources</h2>
      {sources.length > 0 ? (
        <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl border-thin bg-surface">
          {sources.map((source) => {
            const Icon = sourceIcons[source.sourceType];

            return (
              <div key={source.id} className="flex gap-3 p-4">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.04em] text-faint">
                      {sourceLabels[source.sourceType]}
                    </span>
                    {source.ref && <span className="text-[11px] text-faint">· {source.ref}</span>}
                  </div>
                  {source.url ? (
                    <a
                      href={source.url}
                      className="text-[15px] font-medium text-ink underline decoration-[var(--hairline)] underline-offset-[3px] hover:decoration-accent"
                    >
                      {source.title}
                    </a>
                  ) : (
                    <p className="text-[15px] font-medium text-ink">{source.title}</p>
                  )}
                  {source.author && <p className="mt-1 text-[13px] text-muted">{source.author}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border-thin bg-surface p-4">
          <p className="text-sm text-muted">No sources have been added yet.</p>
        </div>
      )}
    </section>
  );
}
