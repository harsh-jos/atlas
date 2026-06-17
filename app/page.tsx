import db from '@/lib/db';
import { CollectionCard } from '@/components/collection/CollectionCard';
import { NewCollectionCard } from '@/components/collection/NewCollectionCard';
import { Badge } from '@/components/ui/Badge';
import { timeAgo } from '@/lib/utils';
import Link from 'next/link';
import { BookOpenText, NotebookPen } from 'lucide-react';
import { CreateNoteButton } from '@/components/note/CreateNoteButton';

export const dynamic = 'force-dynamic';

async function getHomeData() {
  const [collections, totalEntries, publishedEntries, draftEntries, recentEntries, totalNotes, recentNotes] =
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
      db.note.count(),
      db.note.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          _count: {
            select: {
              links: true,
            },
          },
        },
      }),
    ]);

  return {
    collections,
    totalEntries,
    publishedEntries,
    draftEntries,
    recentEntries,
    totalNotes,
    recentNotes,
  };
}

export default async function HomePage() {
  const { collections, totalEntries, publishedEntries, draftEntries, recentEntries, totalNotes, recentNotes } =
    await getHomeData();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      {/* Page header */}
      <header className="mb-10">
        <h1 className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-ink">
          Library shelf
        </h1>
        <p className="mt-3 text-[17px] leading-snug text-muted">
          One home for knowledge reading and private notes.
        </p>
      </header>

      {/* Stats strip */}
      <div className="mb-12 grid grid-cols-2 divide-x divide-[var(--hairline)] overflow-hidden rounded-2xl border-thin bg-surface sm:grid-cols-4">
        <Stat label="Total entries" value={totalEntries} />
        <Stat label="Published" value={publishedEntries} />
        <Stat label="Drafts" value={draftEntries} />
        <Stat label="Personal notes" value={totalNotes} />
      </div>

      <section className="mb-7 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.02em] text-ink">Knowledge base</h2>
          <p className="mt-1 text-sm text-muted">Collections of imported and curated learning content.</p>
        </div>
      </section>

      {/* Knowledge-base collections */}
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

      <section className="mb-10">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-[22px] font-medium tracking-[-0.02em] text-ink">Personal notes</h2>
            <p className="mt-1 text-sm text-muted">Private self-talk space. Link-only references to knowledge base.</p>
          </div>
          <CreateNoteButton variant="secondary" size="sm" className="h-9 rounded-lg px-3.5 text-[13px]" />
        </div>

        <div className="overflow-hidden rounded-2xl border-thin bg-surface">
          {recentNotes.length > 0 ? (
            recentNotes.map((note, index) => (
              <Link
                key={note.id}
                href={`/notes/${note.slug}`}
                className={`group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-canvas ${
                  index > 0 ? 'border-t-thin' : ''
                }`}
              >
                <NotebookPen className="h-3.5 w-3.5 text-faint" />
                <span className="flex-1 truncate text-sm font-medium text-body transition-colors group-hover:text-ink">
                  {note.title}
                </span>
                <span className="hidden text-xs text-muted sm:block">
                  {note._count.links} {note._count.links === 1 ? 'KB link' : 'KB links'}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">
                  {timeAgo(note.updatedAt)}
                </span>
              </Link>
            ))
          ) : (
            <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
              <BookOpenText className="h-4 w-4 text-faint" />
              No notes yet. Create one to start your private thinking space.
            </div>
          )}
        </div>
      </section>

      {/* Recently updated in knowledge base */}
      {recentEntries.length > 0 && (
        <section>
          <h2 className="mb-5 text-[22px] font-medium tracking-[-0.02em] text-ink">
            Recently updated in knowledge base
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
