import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

export interface NoteCardProps {
  title: string;
  slug: string;
  body: string | null;
  linkCount: number;
  updatedAt: Date | string;
}

export function NoteCard({ title, slug, body, linkCount, updatedAt }: NoteCardProps) {
  return (
    <Link
      href={`/notes/${slug}`}
      className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-canvas"
    >
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-medium text-ink">{title}</h3>
        {body?.trim() && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{body}</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
          <span>{linkCount} {linkCount === 1 ? 'KB link' : 'KB links'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{timeAgo(updatedAt)}</span>
        </div>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-muted" />
    </Link>
  );
}
