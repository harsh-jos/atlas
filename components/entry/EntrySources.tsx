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
      <h2 className="mb-4 text-base font-medium text-zinc-900">Sources</h2>
      {sources.length > 0 ? (
        <div className="divide-y divide-zinc-100/70 rounded-lg border-thin border-zinc-200/80 bg-white">
          {sources.map((source) => {
            const Icon = sourceIcons[source.sourceType];

            return (
              <div key={source.id} className="flex gap-3 p-4">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-zinc-400">
                      {sourceLabels[source.sourceType]}
                    </span>
                    {source.ref && <span className="text-[11px] text-zinc-400">{source.ref}</span>}
                  </div>
                  {source.url ? (
                    <a
                      href={source.url}
                      className="text-sm font-medium text-zinc-800 underline decoration-zinc-200 underline-offset-4 hover:text-zinc-950"
                    >
                      {source.title}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-zinc-800">{source.title}</p>
                  )}
                  {source.author && <p className="mt-1 text-xs text-zinc-500">{source.author}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-4">
          <p className="text-sm text-zinc-500">No sources have been added yet.</p>
        </div>
      )}
    </section>
  );
}
