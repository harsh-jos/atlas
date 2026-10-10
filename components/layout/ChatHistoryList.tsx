'use client';

import { useState } from 'react';
import { loadOlderSessions } from '@/app/chat/actions';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, timeAgo, truncate } from '@/lib/utils';
import type { ChatSessionSummary } from '@/lib/api-types';

const TITLE_LENGTH = 20;

/** Every past chat, latest-first — the section collapses away once there's nothing to show. */
export function ChatHistoryList({ sessions }: { sessions: ChatSessionSummary[] }) {
  const pathname = usePathname();
  const [older, setOlder] = useState<ChatSessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(sessions.length === 100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = [...new Map([...sessions, ...older].map((row) => [row.sessionId, row])).values()];
  async function more() {
    setLoading(true);
    const result = await loadOlderSessions(visible.length);
    setLoading(false);
    if (result.error !== undefined) { setError(result.error); return; }
    setError(null);
    setOlder((current) => [...current, ...result.value]);
    setHasMore(result.value.length === 100);
  }

  if (sessions.length === 0) return null;

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col border-t pt-4 px-3">
      <p className="px-2.5 pb-2 text-xs text-faint">History</p>
      <div className="scroll-region min-h-0 flex-1 space-y-0.5">
        {visible.map((session) => {
          const href = `/chat/${session.sessionId}`;
          const active = pathname === href;
          return (
            <Link
              key={session.sessionId}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring flex h-8 items-center justify-between gap-2 rounded-[8px] px-2.5 text-sm transition-colors duration-[var(--dur-fast)]',
                active
                  ? 'border bg-surface font-medium text-ink shadow-card'
                  : 'text-muted hover:bg-surface-soft hover:text-ink'
              )}
            >
              <span className="truncate">
                {truncate(session.firstMessage ?? 'New chat', TITLE_LENGTH)}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-faint">
                {timeAgo(session.updatedAt)}
              </span>
            </Link>
          );
        })}
        {hasMore && <button type="button" className="focus-ring px-2.5 py-2 text-xs text-muted" disabled={loading} onClick={() => void more()}>{loading ? 'Loading…' : 'More chats'}</button>}
        {error && <p className="px-2.5 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
