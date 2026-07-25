'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendTurn, socketTicket } from '@/app/chat/actions';
import { CurationCard } from '@/components/chat/CurationCard';
import { Button } from '@/components/ui/Button';
import type { ChatMessage } from '@/lib/api-types';

const WS_URL = process.env.NEXT_PUBLIC_ATLAS_WS_URL ?? 'ws://localhost:8000/ws';

/** What each tool call is called while the reader waits — the agent's work, made legible. */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: 'Checking what you already know',
  researcher: 'Researching the open web',
  preview_source: 'Reading the source',
  commit_artifacts: 'Saving what you chose',
};

/** The first-run moment — three or four honest ways to start a research thread. */
const STARTER_PROMPTS = [
  'Explain how transformer attention actually works',
  "What's the real difference between LoRA and full fine-tuning?",
  'Break down how vector databases do similarity search',
  'Teach me the CAP theorem with concrete examples',
];

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

  const isEmpty = entries.length === 0 && !pending;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 sm:px-6">
      <div className="scroll-region min-h-0 flex-1">
        {isEmpty ? (
          <EmptyState onPick={(prompt) => void say(prompt)} />
        ) : (
          <div className="space-y-7 py-8">
            {entries.map((entry, index) =>
              entry.kind === 'curation' ? (
                <CurationCard
                  key={entry.previewId}
                  previewId={entry.previewId}
                  onResolved={(note) => void say(note)}
                />
              ) : (
                <MessageRow key={index} role={entry.role} text={entry.text} />
              )
            )}

            {pending && <ThinkingIndicator activity={activity} />}

            {error && (
              <p role="alert" className="text-[13px] text-red-600">
                {error}
              </p>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <Composer draft={draft} pending={pending} onDraftChange={setDraft} onSubmit={submit} />
    </div>
  );
}

function MessageRow({ role, text }: { role: 'you' | 'atlas'; text: string }) {
  if (role === 'you') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] whitespace-pre-wrap rounded-card bg-surface-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink shadow-raise">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-ink font-mono text-[9.5px] font-semibold text-white">
        A
      </span>
      <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15.5px] leading-[1.75] text-body">
        {text}
      </p>
    </div>
  );
}

function ThinkingIndicator({ activity }: { activity: string[] }) {
  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-ink">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80"
          style={{ animationDuration: '1.4s' }}
        />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {activity.map((label, index) => (
          <p key={index} className="animate-rise font-mono text-[11.5px] text-faint">
            {label}…
          </p>
        ))}
        <p className="font-mono text-[11.5px] text-faint">Thinking…</p>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-4 text-center">
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0"
        style={{
          maskImage: 'radial-gradient(60% 55% at 50% 42%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(60% 55% at 50% 42%, black, transparent)',
        }}
      />
      <div className="animate-rise relative max-w-lg">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
            New session
          </span>
        </div>
        <h1 className="font-title text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[34px]">
          What are you curious about?
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[14.5px] leading-relaxed text-muted">
          Ask a question. Atlas checks what you already know, researches the open web, and shows
          you exactly what it would keep — before anything is saved.
        </p>

        <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPick(prompt)}
              className="focus-ring rounded-card border-thin bg-surface px-4 py-3.5 text-left shadow-raise transition-all duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card"
            >
              <span className="text-[13.5px] leading-snug text-ink">{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ComposerProps {
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

function Composer({ draft, pending, onDraftChange, onSubmit }: ComposerProps) {
  return (
    <form
      className="shrink-0 pb-6 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-end gap-2 rounded-card border-thin bg-surface p-2 pl-4 shadow-raise transition-shadow duration-[var(--dur-fast)] focus-within:border-accent/40 focus-within:shadow-card">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          placeholder="What do you want to understand?"
          className="flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-faint focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-2.5 pb-1">
          <span className="hidden items-center gap-1 font-mono text-[11px] text-faint sm:flex">
            <kbd className="rounded-[4px] border-thin bg-surface-soft px-1.5 py-0.5">⏎</kbd>
            to send
          </span>
          <Button
            type="submit"
            size="md"
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="w-9 px-0 shrink-0"
          >
            <SendIcon />
          </Button>
        </div>
      </div>
    </form>
  );
}

function SendIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 16V4M10 4L4.5 9.5M10 4l5.5 5.5" />
    </svg>
  );
}
