import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn, timeAgo } from '@/lib/utils';

export interface EntryCardProps {
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED';
  sourceCount: number;
  updatedAt: Date | string;
}

export function EntryCard({
  title,
  slug,
  summary,
  tags,
  status,
  sourceCount,
  updatedAt,
}: EntryCardProps) {
  const isDraft = status === 'DRAFT';

  return (
    <Link
      href={`/entries/${slug}`}
      className={cn(
        'group flex items-start gap-4 px-5 py-4 transition-colors',
        // Drafts sit on a faint tinted surface to read as in-progress.
        isDraft ? 'bg-surface-soft hover:bg-[#f1f2f4]' : 'hover:bg-surface-soft'
      )}
    >
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              'font-display text-[15px] font-semibold tracking-[-0.02em] transition-colors truncate',
              isDraft ? 'text-muted group-hover:text-ink' : 'text-ink'
            )}
          >
            {title}
          </span>
          {isDraft && (
            <Badge variant="secondary" className="text-[10px] shrink-0">Draft</Badge>
          )}
        </div>

        {/* Summary preview */}
        {summary && (
          <p className="text-[13px] text-muted line-clamp-2 leading-relaxed mb-2">
            {summary}
          </p>
        )}

        {/* Meta row: tags, source count, time */}
        <div className="flex items-center gap-2 flex-wrap">
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="default" className="text-[10px]">
              {tag}
            </Badge>
          ))}
          {sourceCount > 0 && (
            <span className="text-[11px] text-faint">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </span>
          )}
          <span className="text-[11px] text-faint font-mono tabular-nums">
            {timeAgo(updatedAt)}
          </span>
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 text-faint group-hover:text-muted transition-colors mt-0.5 shrink-0" />
    </Link>
  );
}
