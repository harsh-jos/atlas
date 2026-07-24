import type { ArtifactDetail } from '@/lib/api-types';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ReadingProgressBar } from '@/components/entry/ReadingProgressBar';
import { EntrySummary } from '@/components/entry/EntrySummary';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { HtmlBody } from '@/components/entry/HtmlBody';
import { EntrySources } from '@/components/entry/EntrySources';
import { EntryRelations } from '@/components/entry/EntryRelations';
import { EntryTags } from '@/components/entry/EntryTags';
import { EntryMetadata } from '@/components/entry/EntryMetadata';
import { cleanTitle, formatDate } from '@/lib/utils';

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

  return (
    <>
      <ReadingProgressBar />

      <div className="mx-auto max-w-[40rem] px-5 py-12 sm:px-8">
        <Breadcrumb
          className="mb-7"
          items={[
            { label: 'Library', href: '/' },
            { label: artifact.concept.name, href: `/collections/${artifact.concept.slug}` },
            { label: cleanTitle(artifact.title) },
          ]}
        />

        <article className="font-reading">
          <header className="mb-6">
            <h1 className="font-title text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[36px] sm:leading-[1.1]">
              {cleanTitle(artifact.title)}
            </h1>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-faint">
              <span>{artifact.concept.name}</span>
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

          <EntrySummary summary={artifact.summary} />

          <div className="mt-8">
            {artifact.bodyHtml?.trim() ? (
              <HtmlBody html={artifact.bodyHtml} />
            ) : (
              <MarkdownBody body={artifact.body} />
            )}
          </div>

          {hasEndMatter && (
            <footer className="mt-16 space-y-11 border-t-thin pt-10">
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
