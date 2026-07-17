import Link from 'next/link';
import type { EntryArtifactData } from '@/lib/entry-data';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ReadingProgressBar } from '@/components/entry/ReadingProgressBar';
import { EntrySummary } from '@/components/entry/EntrySummary';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { EntrySources } from '@/components/entry/EntrySources';
import { EntryRelations } from '@/components/entry/EntryRelations';
import { EntryTags } from '@/components/entry/EntryTags';
import { EntryMetadata } from '@/components/entry/EntryMetadata';
import { cleanTitle, formatDate } from '@/lib/utils';

export interface EntryArtifactProps {
  entry: EntryArtifactData;
}

function hasDetails(metadata: unknown): boolean {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    Object.keys(metadata as object).length > 0
  );
}

export function EntryArtifact({ entry }: EntryArtifactProps) {
  // Match what the Related block shows: all outgoing + incoming except
  // SEE_ALSO (which is always stored in both directions).
  const incomingShown = entry.relationsTo.filter((r) => r.relationType !== 'SEE_ALSO');
  const relationCount = entry.relationsFrom.length + incomingShown.length;

  const hasEndMatter =
    entry.sources.length > 0 ||
    relationCount > 0 ||
    entry.tags.length > 0 ||
    hasDetails(entry.metadata);

  return (
    <>
      <ReadingProgressBar />

      <div className="mx-auto max-w-[40rem] px-5 py-12 sm:px-8">
        {/* Quiet top row — orientation + a way out to edit, nothing loud */}
        <div className="mb-7 flex items-center justify-between gap-4">
          <Breadcrumb
            items={[
              { label: 'Library', href: '/' },
              { label: entry.collection.name, href: `/collections/${entry.collection.slug}` },
              { label: cleanTitle(entry.title) },
            ]}
          />
          <Link
            href={`/entries/${entry.slug}?edit=true`}
            className="shrink-0 text-[13px] text-muted transition-colors hover:text-ink"
          >
            Edit
          </Link>
        </div>

        <article className="font-reading">
          <header className="mb-6">
            <h1 className="font-title text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[36px] sm:leading-[1.1]">
              {cleanTitle(entry.title)}
            </h1>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-faint">
              <span>{entry.collection.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(entry.createdAt)}</span>
              {entry.sources.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {entry.sources.length} {entry.sources.length === 1 ? 'source' : 'sources'}
                  </span>
                </>
              )}
              {relationCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {relationCount} {relationCount === 1 ? 'relation' : 'relations'}
                  </span>
                </>
              )}
            </div>
          </header>

          <EntrySummary summary={entry.summary} />

          <div className="mt-8">
            <MarkdownBody body={entry.body} />
          </div>

          {hasEndMatter && (
            <footer className="mt-16 space-y-11 border-t-thin pt-10">
              <EntrySources sources={entry.sources} />
              <EntryRelations outgoing={entry.relationsFrom} incoming={entry.relationsTo} />
              <EntryTags tags={entry.tags} />
              <EntryMetadata metadata={entry.metadata} />
            </footer>
          )}
        </article>
      </div>
    </>
  );
}
