import db from '@/lib/db';
import { CollectionShelf } from '@/components/collection/CollectionShelf';
import { NewCollectionCard } from '@/components/collection/NewCollectionCard';

export const dynamic = 'force-dynamic';

async function getShelves() {
  return db.collection.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      // One most-recent entry per shelf — surfaced faintly on the spine.
      entries: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { title: true },
      },
    },
  });
}

export default async function HomePage() {
  const collections = await getShelves();

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <header className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Your library
          </span>
        </div>
        <h1 className="font-display text-[46px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
          Library
        </h1>
        <p className="mt-3 text-[18px] leading-snug text-muted">
          Everything you’re learning, on one shelf.
        </p>
      </header>

      {collections.length === 0 && (
        <p className="mb-6 text-[14px] text-muted">
          No shelves yet — create your first one to begin.
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {collections.map((collection) => (
          <CollectionShelf
            key={collection.id}
            name={collection.name}
            slug={collection.slug}
            description={collection.description}
            color={collection.color}
            recentEntryTitle={collection.entries[0]?.title ?? null}
          />
        ))}
        <NewCollectionCard />
      </div>
    </div>
  );
}
