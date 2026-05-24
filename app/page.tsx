import db from '@/lib/db';
import { CollectionCard } from '@/components/collection/CollectionCard';
import { Badge } from '@/components/ui/Badge';
import { timeAgo } from '@/lib/utils';
import Link from 'next/link';
import { FileText, Send, PenLine } from 'lucide-react';

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
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Page title */}
      <h1 className="text-lg font-medium tracking-tight text-zinc-900 mb-6">
        Collections
      </h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard icon={<FileText className="h-3.5 w-3.5" />} label="Total entries" value={totalEntries} />
        <StatCard icon={<Send className="h-3.5 w-3.5" />} label="Published" value={publishedEntries} />
        <StatCard icon={<PenLine className="h-3.5 w-3.5" />} label="Drafts" value={draftEntries} />
      </div>

      {/* Collections grid */}
      {collections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
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
        </div>
      ) : (
        <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-8 text-center mb-12">
          <p className="text-sm text-zinc-400">No collections yet.</p>
        </div>
      )}

      {/* Recently updated */}
      {recentEntries.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-900 mb-4">Recently updated</h2>
          <div className="rounded-lg border-thin border-zinc-200/80 bg-white divide-y divide-zinc-100/60">
            {recentEntries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/50 transition-colors group"
              >
                {/* Collection color dot */}
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.collection.color || '#888' }}
                />
                {/* Entry title */}
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors flex-1 truncate">
                  {entry.title}
                </span>
                {/* Collection name */}
                <span className="text-[11px] text-zinc-400 hidden sm:block">
                  {entry.collection.name}
                </span>
                {/* Status badge */}
                {entry.status === 'DRAFT' && (
                  <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                )}
                {/* Time ago */}
                <span className="text-[11px] text-zinc-400 font-mono tabular-nums shrink-0">
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-zinc-400">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <span className="text-xl font-medium text-zinc-900 tracking-tight font-mono tabular-nums">
        {value}
      </span>
    </div>
  );
}
