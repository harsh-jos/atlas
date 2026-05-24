import Link from 'next/link';
import { Pencil, PencilLine } from 'lucide-react';
import type { EntryArtifactData } from '@/lib/entry-data';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { EntrySummary } from '@/components/entry/EntrySummary';
import { MarkdownBody } from '@/components/entry/MarkdownBody';
import { EntrySources } from '@/components/entry/EntrySources';
import { EntryRelations } from '@/components/entry/EntryRelations';
import { EntryMetadata } from '@/components/entry/EntryMetadata';
import { formatDate } from '@/lib/utils';

export interface EntryArtifactProps {
  entry: EntryArtifactData;
}

export function EntryArtifact({ entry }: EntryArtifactProps) {
  // Match what the Relations panel shows: all outgoing + incoming except
  // SEE_ALSO (which is always stored in both directions).
  const incomingShown = entry.relationsTo.filter((r) => r.relationType !== 'SEE_ALSO');
  const relationCount = entry.relationsFrom.length + incomingShown.length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Home', href: '/' },
          { label: entry.collection.name, href: `/collections/${entry.collection.slug}` },
          { label: entry.title },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0">
          <header className="mb-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <Badge key={tag} variant="default">
                    {tag}
                  </Badge>
                ))}
                <Badge variant={entry.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                  {entry.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <Link href={`/entries/${entry.slug}?edit=true`}>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </Link>
            </div>

            <h1 className="max-w-[72ch] text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">
              {entry.title}
            </h1>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{entry.collection.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(entry.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {entry._count.sources} {entry._count.sources === 1 ? 'source' : 'sources'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {relationCount} {relationCount === 1 ? 'relation' : 'relations'}
              </span>
            </div>
          </header>

          <div className="max-w-[72ch]">
            {entry.status === 'DRAFT' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border-l-2 border-l-amber-300 border-thin bg-amber-50/40 px-3.5 py-2.5 text-xs text-amber-800/90">
                <PencilLine className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>This entry is a draft — it’s hidden from the graph and default lists.</span>
              </div>
            )}
            <EntrySummary summary={entry.summary} />
            <div className="mt-8">
              <MarkdownBody body={entry.body} />
            </div>
            <EntrySources sources={entry.sources} />
          </div>
        </article>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <EntryMetadata metadata={entry.metadata} />
          <EntryRelations outgoing={entry.relationsFrom} incoming={entry.relationsTo} />
        </div>
      </div>
    </div>
  );
}
