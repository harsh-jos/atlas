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
        'group flex items-start gap-4 px-4 py-3.5 transition-colors',
        // Drafts sit on a faint tinted surface to read as in-progress.
        isDraft ? 'bg-zinc-50/60 hover:bg-zinc-100/50' : 'hover:bg-zinc-50/50'
      )}
    >
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              'text-sm font-medium transition-colors truncate',
              isDraft ? 'text-zinc-500 group-hover:text-zinc-700' : 'text-zinc-800 group-hover:text-zinc-950'
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
          <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-1.5">
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
            <span className="text-[10px] text-zinc-400 font-medium">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </span>
          )}
          <span className="text-[10px] text-zinc-300 font-mono tabular-nums">
            {timeAgo(updatedAt)}
          </span>
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors mt-0.5 shrink-0" />
    </Link>
  );
}
