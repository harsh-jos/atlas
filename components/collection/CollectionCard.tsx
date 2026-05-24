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
  const accentColor = color || 'var(--faint)';

  return (
    <Link href={`/collections/${slug}`} className="group block">
      <div className="flex h-full flex-col justify-between rounded-2xl border-thin bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)]">
        <div>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{name}</h3>
          </div>
          {description && (
            <p className="mb-5 line-clamp-2 text-[13px] leading-relaxed text-muted">{description}</p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between border-t-thin pt-3.5">
          <span className="text-[12px] tabular-nums text-muted">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
          <span className="text-[12px] text-faint">{formatDate(updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
