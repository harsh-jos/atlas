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
      className="group block h-full rounded-2xl"
    >
      <Card className="h-full gap-0 overflow-hidden rounded-2xl py-0 shadow-none transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent-line group-hover:shadow-[0_8px_24px_#1b2b3e08]">
        <CardContent className="flex h-full flex-col p-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="flex size-11 items-center justify-center rounded-xl border border-accent-line/60 bg-accent-soft text-accent">
              <Layers
                className="size-5"
                style={{ color: color || undefined }}
                aria-hidden="true"
              />
            </span>
            <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-accent" />
          </div>
          <h3 className="break-words text-[16px] font-semibold tracking-tight text-ink">
            {name}
          </h3>
          <p className="mt-2 line-clamp-2 min-h-10 text-[12px] leading-5 text-muted">
            {description ||
              'A place for the ideas and explanations you choose to keep.'}
          </p>
          <div className="mt-5 border-t pt-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
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
