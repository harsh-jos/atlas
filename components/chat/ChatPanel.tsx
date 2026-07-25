'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendTurn, socketTicket } from '@/app/chat/actions';
import { CurationCard } from '@/components/chat/CurationCard';
import { Button } from '@/components/ui/Button';
import type { ChatMessage } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const WS_URL = process.env.NEXT_PUBLIC_ATLAS_WS_URL ?? 'ws://localhost:8000/ws';

/** What each tool call is called while the reader waits — the agent's work, made legible. */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: 'Checking what you already know',
  researcher: 'Researching the open web',
  preview_source: 'Reading the source',
  commit_artifacts: 'Saving what you chose',
};

type Entry =
  | { kind: 'message'; role: 'you' | 'atlas'; text: string }
  | { kind: 'curation'; previewId: string };

export interface ChatPanelProps {
  /** The session this chat continues — it lives in the URL so a reload reopens the conversation. */
  sessionId: string;
  /** Turns already stored for this session, replayed so a reopened URL is not blank. */
  initialMessages: ChatMessage[];
}

export function ChatPanel({ sessionId, initialMessages }: ChatPanelProps) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    initialMessages.map((message) => ({ kind: 'message', ...message }))
  );
  const [activity, setActivity] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const say = useCallback(async (message: string) => {
    setError(null);
    setActivity([]);
    setEntries((seen) => [...seen, { kind: 'message', role: 'you', text: message }]);
    setPending(true);

    const result = await sendTurn(sessionId, message);
    setPending(false);
    setActivity([]);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setEntries((seen) => [...seen, { kind: 'message', role: 'atlas', text: result.value }]);
  }, [sessionId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;

    void (async () => {
      const ticket = await socketTicket();
      if (cancelled || ticket.error !== undefined) return;
      socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(ticket.value)}`);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as {
          type: string;
          name?: string;
          previewId?: string;
        };
        if (message.type === 'agent.tool' && message.name) {
          const name = message.name;
          setActivity((seen) => [...seen, TOOL_LABELS[name] ?? name]);
        }
        if (message.type === 'agent.preview' && message.previewId) {
          const previewId = message.previewId;
          setEntries((seen) =>
            seen.some((entry) => entry.kind === 'curation' && entry.previewId === previewId)
              ? seen
              : [...seen, { kind: 'curation', previewId }]
          );
        }
      };
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, activity]);

  const submit = useCallback(() => {
    const message = draft.trim();
    if (!message || pending) return;
    setDraft('');
    void say(message);
  }, [draft, pending, say]);

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1 space-y-5">
        {entries.length === 0 && !pending && (
          <p className="text-[15px] leading-relaxed text-muted">
            Ask about something you want to understand. Atlas will check what you already know,
            find where to learn it, and show you exactly what it would keep — before it keeps
            anything.
          </p>
        )}

        {entries.map((entry, index) =>
          entry.kind === 'curation' ? (
            <CurationCard
              key={entry.previewId}
              previewId={entry.previewId}
              onResolved={(note) => void say(note)}
            />
          ) : (
            <div key={index} className={cn(entry.role === 'you' && 'flex justify-end')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed',
                  entry.role === 'you'
                    ? 'rounded-card bg-surface-soft px-4 py-2.5 text-ink'
                    : 'text-body'
                )}
              >
                {entry.text}
              </div>
            </div>
          )
        )}

        {pending && (
          <div className="space-y-1.5" aria-live="polite">
            {activity.map((label, index) => (
              <p key={index} className="font-mono text-[12px] text-faint">
                {label}…
              </p>
            ))}
            <p className="text-[13px] text-muted">Thinking…</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-0 mt-6 flex items-end gap-2 border-t-thin bg-canvas pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="What do you want to understand?"
          className="flex-1 resize-none rounded-card border-thin bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
        />
        <Button type="submit" disabled={pending || !draft.trim()} size="lg">
          Send
        </Button>
      </form>
    </div>
  );
}
