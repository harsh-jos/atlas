import db from '@/lib/db';
import { CollectionCard } from '@/components/collection/CollectionCard';
import { NewCollectionCard } from '@/components/collection/NewCollectionCard';
import { Badge } from '@/components/ui/Badge';
import { timeAgo } from '@/lib/utils';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getHomeData() {
  const [collections, totalEntries, publishedEntries, draftEntries, recentEntries] =
    await Promise.all([
      db.collection.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { entries: true } } },
      }),
      db.entry.count(),
      db.entry.count({ where: { status: 'PUBLISHED' } }),
      db.entry.count({ where: { status: 'DRAFT' } }),
      db.entry.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: { collection: true },
      }),
    ]);

  return { collections, totalEntries, publishedEntries, draftEntries, recentEntries };
}

export default async function HomePage() {
  const { collections, totalEntries, publishedEntries, draftEntries, recentEntries } =
    await getHomeData();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      {/* Page header */}
      <header className="mb-10">
        <h1 className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-ink">
          Collections
        </h1>
        <p className="mt-3 text-[17px] leading-snug text-muted">
          Your knowledge base, organised by topic.
        </p>
      </header>

      {/* Stats strip */}
      <div className="mb-12 grid grid-cols-3 divide-x divide-[var(--hairline)] overflow-hidden rounded-2xl border-thin bg-surface">
        <Stat label="Total entries" value={totalEntries} />
        <Stat label="Published" value={publishedEntries} />
        <Stat label="Drafts" value={draftEntries} />
      </div>

      {/* Collections */}
      <div className="mb-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <CollectionCard
            key={collection.id}
            name={collection.name}
            slug={collection.slug}
            description={collection.description}
            color={collection.color}
            entryCount={collection._count.entries}
            updatedAt={collection.updatedAt}
          />
        ))}
        <NewCollectionCard />
      </div>

      {/* Recently updated */}
      {recentEntries.length > 0 && (
        <section>
          <h2 className="mb-5 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Recently updated
          </h2>
          <div className="overflow-hidden rounded-2xl border-thin bg-surface">
            {recentEntries.map((entry, index) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.slug}`}
                className={`group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-canvas ${
                  index > 0 ? 'border-t-thin' : ''
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.collection.color || 'var(--faint)' }}
                />
                <span className="flex-1 truncate text-sm font-medium text-body transition-colors group-hover:text-ink">
                  {entry.title}
                </span>
                {entry.status === 'DRAFT' && (
                  <Badge variant="secondary" className="text-[10px]">
                    Draft
                  </Badge>
                )}
                <span className="hidden text-xs text-muted sm:block">{entry.collection.name}</span>
                <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">
                  {timeAgo(entry.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-6 py-5">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
        {value}
      </div>
    </div>
  );
}
