import Link from 'next/link';
import type { ArtifactDetail } from '@/lib/api-types';
import { ReadingProgressBar } from '@/components/entry/ReadingProgressBar';
import { EntrySummary } from '@/components/entry/EntrySummary';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { HtmlBody } from '@/components/entry/HtmlBody';
import { EntrySources } from '@/components/entry/EntrySources';
import { EntryRelations } from '@/components/entry/EntryRelations';
import { EntryTags } from '@/components/entry/EntryTags';
import { EntryMetadata } from '@/components/entry/EntryMetadata';
import { cleanTitle, duplicatesOpening, estimateReadingTime, formatDate } from '@/lib/utils';

export interface EntryArtifactProps {
  artifact: ArtifactDetail;
}

function hasDetails(metadata: Record<string, unknown> | null): boolean {
  return !!metadata && Object.keys(metadata).length > 0;
}

export function EntryArtifact({ artifact }: EntryArtifactProps) {
  // Match what the Related block shows: all outgoing + incoming except
  // SEE_ALSO (which is always stored in both directions).
  const incomingShown = artifact.relationsTo.filter((r) => r.relationType !== 'SEE_ALSO');
  const relationCount = artifact.relationsFrom.length + incomingShown.length;

  const hasEndMatter =
    artifact.sources.length > 0 ||
    relationCount > 0 ||
    artifact.tags.length > 0 ||
    hasDetails(artifact.metadata);

  const body = artifact.bodyHtml || artifact.body;
  const readingTime = estimateReadingTime(body);

  return (
    <>
      <ReadingProgressBar />

      <div className="mx-auto max-w-[43rem] px-5 py-12 sm:px-8">
        <article className="">
          <header className="mb-8">
            {/* One statement of where you are, and it navigates — the eyebrow does the
                breadcrumb's job without saying the concept twice. */}
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <Link
                href={`/collections/${artifact.concept.slug}`}
                className="focus-ring truncate rounded-sm font-mono text-[11px] uppercase tracking-[0.08em] text-faint transition-colors hover:text-ink"
              >
                {artifact.concept.name}
              </Link>
              <Link
                href={`/entries/${artifact.slug}?edit=true`}
                className="focus-ring shrink-0 rounded-md text-[13px] text-faint transition-colors hover:text-ink"
              >
                Edit
              </Link>
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
              {cleanTitle(artifact.title)}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-faint">
              <span>{readingTime}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(artifact.createdAt)}</span>
              {artifact.sources.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {artifact.sources.length}{' '}
                    {artifact.sources.length === 1 ? 'source' : 'sources'}
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

          {!duplicatesOpening(artifact.summary, body) && (
            <EntrySummary summary={artifact.summary} />
          )}

          <div className="mt-8">
            {artifact.bodyHtml?.trim() ? (
              <HtmlBody html={artifact.bodyHtml} />
            ) : (
              <MarkdownBody body={artifact.body} />
            )}
          </div>

          {hasEndMatter && (
            <footer className="mt-16 space-y-11 border-t pt-10">
              <EntrySources sources={artifact.sources} />
              <EntryRelations outgoing={artifact.relationsFrom} incoming={artifact.relationsTo} />
              <EntryTags tags={artifact.tags} />
              <EntryMetadata metadata={artifact.metadata} />
            </footer>
          )}
        </article>
      </div>
    </>
  );
}
