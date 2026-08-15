import Link from 'next/link';
import { Calendar, ChevronLeft, Clock, Link2 } from 'lucide-react';
import type { ArtifactDetail, Relation } from '@/lib/api-types';
import { ReadingProgressBar } from '@/components/entry/ReadingProgressBar';
import { EntryCoverBand } from '@/components/entry/EntryCoverBand';
import { EntryLineage } from '@/components/entry/EntryLineage';
import { EntrySummary } from '@/components/entry/EntrySummary';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { HtmlBody } from '@/components/entry/HtmlBody';
import { EntrySources } from '@/components/entry/EntrySources';
import { EntryRelations } from '@/components/entry/EntryRelations';
import { EntryTags } from '@/components/entry/EntryTags';
import { EntryMetadata } from '@/components/entry/EntryMetadata';
import { EntryTableOfContents } from '@/components/entry/EntryTableOfContents';
import { cleanTitle, duplicatesOpening, estimateReadingTime, formatDate } from '@/lib/utils';

export interface EntryArtifactProps {
  artifact: ArtifactDetail;
}

// The table of contents reads its headings straight off this element after mount.
const BODY_ID = 'entry-body';

function hasDetails(metadata: Record<string, unknown> | null): boolean {
  return !!metadata && Object.keys(metadata).length > 0;
}

function isPrerequisite(relation: Relation): boolean {
  return relation.relationType === 'PREREQUISITE';
}

export function EntryArtifact({ artifact }: EntryArtifactProps) {
  // PREREQUISITE is the one relation type that's genuinely sequential, so it's
  // pulled out into the lineage strip up top; everything else — USES, PART_OF,
  // CONTRASTS, SEE_ALSO — stays associative and lives in the Related footer.
  const prerequisites = artifact.relationsFrom.filter(isPrerequisite).map((r) => r.artifact);
  const enables = artifact.relationsTo.filter(isPrerequisite).map((r) => r.artifact);
  const relationsFrom = artifact.relationsFrom.filter((r) => !isPrerequisite(r));
  const relationsTo = artifact.relationsTo.filter((r) => !isPrerequisite(r));

  // Match what the Related block shows: all outgoing + incoming except
  // SEE_ALSO (which is always stored in both directions).
  const incomingShown = relationsTo.filter((r) => r.relationType !== 'SEE_ALSO');
  const relationCount = relationsFrom.length + incomingShown.length;

  const hasFooterMatter =
    relationCount > 0 || artifact.tags.length > 0 || hasDetails(artifact.metadata);

  const body = artifact.bodyHtml || artifact.body;
  const readingTime = estimateReadingTime(body);

  return (
    <>
      <ReadingProgressBar />
      <EntryCoverBand color={artifact.concept.color} />

      <div className="mx-auto max-w-[54rem] px-5 pb-12 pt-8 sm:px-8">
        <article>
          <div className="max-w-[34rem]">
            <header className="mb-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <Link
                  href={`/collections/${artifact.concept.slug}`}
                  className="focus-ring group inline-flex min-w-0 items-center gap-1 rounded-full bg-surface-soft py-1.5 pl-2 pr-3 text-[12.5px] font-medium text-muted transition-colors duration-[var(--dur-fast)] hover:bg-accent-soft hover:text-accent"
                >
                  <ChevronLeft
                    className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-accent"
                    aria-hidden="true"
                  />
                  <span
                    aria-hidden="true"
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: artifact.concept.color || 'var(--faint)' }}
                  />
                  <span className="truncate">{artifact.concept.name}</span>
                </Link>
                <Link
                  href={`/entries/${artifact.slug}?edit=true`}
                  className="focus-ring shrink-0 rounded-md text-[13px] text-faint transition-colors hover:text-ink"
                >
                  Edit
                </Link>
              </div>

              <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[38px]">
                {cleanTitle(artifact.title)}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[12px] text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-accent" aria-hidden="true" />
                  {readingTime}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-accent" aria-hidden="true" />
                  {formatDate(artifact.createdAt)}
                </span>
                {artifact.sources.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 className="h-3 w-3 text-accent" aria-hidden="true" />
                    {artifact.sources.length}{' '}
                    {artifact.sources.length === 1 ? 'source' : 'sources'}
                  </span>
                )}
              </div>

              <EntryLineage prerequisites={prerequisites} enables={enables} />
            </header>

            {!duplicatesOpening(artifact.summary, body) && (
              <EntrySummary summary={artifact.summary} />
            )}
          </div>

          <div className="mt-9 grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,34rem)_1fr]">
            <div id={BODY_ID} className="entry-body min-w-0">
              {artifact.bodyHtml?.trim() ? (
                <HtmlBody html={artifact.bodyHtml} />
              ) : (
                <MarkdownBody body={artifact.body} />
              )}
            </div>

            <aside className="flex flex-col gap-9 xl:pt-1">
              <EntryTableOfContents bodyId={BODY_ID} />
              {artifact.sources.length > 0 && <EntrySources sources={artifact.sources} />}
            </aside>
          </div>

          {hasFooterMatter && (
            <footer className="mt-16 max-w-[34rem] space-y-11 border-t pt-10">
              <EntryRelations outgoing={relationsFrom} incoming={relationsTo} />
              <EntryTags tags={artifact.tags} />
              <EntryMetadata metadata={artifact.metadata} />
            </footer>
          )}
        </article>
      </div>
    </>
  );
}
