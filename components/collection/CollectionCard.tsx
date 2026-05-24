import * as React from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export interface CollectionCardProps {
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  entryCount: number;
  updatedAt: Date | string;
}

export function CollectionCard({
  name,
  slug,
  description,
  color,
  entryCount,
  updatedAt,
}: CollectionCardProps) {
  const accentColor = color || '#888888';

  return (
    <Link href={`/collections/${slug}`} className="group block">
      <div className="h-full rounded-lg bg-white border-thin border-zinc-200/80 p-4 transition-all duration-150 hover:border-zinc-300 active:scale-[0.98] flex flex-col justify-between">
        <div>
          {/* Header row with color accent */}
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="h-2 w-2 rounded-full inline-block shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <h3 className="text-sm font-medium text-zinc-900 group-hover:text-zinc-950 transition-colors sentence-case">
              {name}
            </h3>
          </div>

          {/* Description */}
          {description && (
            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 font-normal">
              {description}
            </p>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t-thin border-zinc-100/50 pt-3 mt-auto">
          <span className="text-[11px] text-zinc-400 font-medium font-mono">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
          <span className="text-[10px] text-zinc-400 font-medium">
            {formatDate(updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
