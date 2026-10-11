import Link from 'next/link';
import { ArrowUpRight, BookOpen, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/shadcn/card';
import { cleanTitle } from '@/lib/utils';
export interface CollectionShelfProps {
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  recentEntryTitle: string | null;
  entryCount?: number;
}
export function CollectionShelf({
  name,
  slug,
  description,
  color,
  recentEntryTitle,
  entryCount = 0,
}: CollectionShelfProps) {
  return (
    <Link
      href={`/collections/${slug}`}
      className="group block h-full rounded-xl"
    >
      <Card className="h-full gap-0 overflow-hidden rounded-xl py-0 shadow-none transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent-line group-hover:shadow-[0_8px_24px_#1b2b3e08]">
        <CardContent className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex size-8 items-center justify-center rounded-xl border border-accent-line/60 bg-accent-soft text-accent">
              <Layers
                className="size-4"
                style={{ color: color || undefined }}
                aria-hidden="true"
              />
            </span>
            <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-accent" />
          </div>
          <h3 className="break-words text-sm font-semibold tracking-tight text-ink">
            {name}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-muted">
            {description ||
              'A place for the ideas and explanations you choose to keep.'}
          </p>
          <div className="mt-3 border-t pt-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <BookOpen className="size-3" />
              {entryCount} {entryCount === 1 ? 'explanation' : 'explanations'}
            </p>
            <p className="truncate text-[11px] text-faint">
              {recentEntryTitle
                ? cleanTitle(recentEntryTitle)
                : 'Ready for your first question'}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
