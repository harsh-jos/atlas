'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { sendTurn, socketTicket } from '@/app/chat/actions';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { Button } from '@/components/ui/Button';
import type { ChatMessage } from '@/lib/api-types';

const WS_URL = process.env.NEXT_PUBLIC_ATLAS_WS_URL ?? 'ws://localhost:8000/ws';
const COPY_RESET_MS = 1500;
const COMPOSER_MAX_HEIGHT = 160;

/** What each tool call is called while the reader waits — the agent's work, made legible. */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: 'Finding saved explanations',
  researcher: 'Researching the open web',
};

/** The first-run moment — three or four honest ways to start a research thread. */
const STARTER_PROMPTS = [
  'Explain how transformer attention actually works',
  "What's the real difference between LoRA and full fine-tuning?",
  'Break down how vector databases do similarity search',
  'Teach me the CAP theorem with concrete examples',
];

type Entry = ChatMessage;

export interface ChatPanelProps {
  /** The session this chat continues — it lives in the URL so a reload reopens the conversation. */
  sessionId: string;
  /** Turns already stored for this session, replayed so a reopened URL is not blank. */
  initialMessages: ChatMessage[];
}

export function ChatPanel({ sessionId, initialMessages }: ChatPanelProps) {
  const [entries, setEntries] = useState<Entry[]>(initialMessages);
  const [activity, setActivity] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);

  const say = useCallback(async (message: string) => {
    setError(null);
    setActivity([]);
    setEntries((seen) => [...seen, { role: 'you', text: message }]);
    setPending(true);

    const result = await sendTurn(sessionId, message);
    setPending(false);
    setActivity([]);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setEntries((seen) => [...seen, { role: 'atlas', text: result.value }]);
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
        };
        if (message.type === 'agent.tool' && message.name) {
          const name = message.name;
          setActivity((seen) => [...seen, TOOL_LABELS[name] ?? name]);
        }
      };
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  // Scrolls only this container — never the app-wide scroll region above it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: didMountRef.current ? 'smooth' : 'auto' });
    didMountRef.current = true;
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
      <div ref={scrollRef} className="scroll-region min-h-0 flex-1">
        {isEmpty ? (
          <EmptyState onPick={(prompt) => void say(prompt)} />
        ) : (
          <div className="space-y-6 pb-4 pt-6">
            {entries.map((entry, index) => (
              <MessageRow key={index} role={entry.role} text={entry.text} />
            ))}

            {pending && <ThinkingIndicator activity={activity} />}

            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
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
        <div className="max-w-[75%] whitespace-pre-wrap rounded-card bg-surface-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-sky to-deep font-mono text-[9.5px] font-semibold text-white">
        A
      </span>
      <div className="min-w-0 flex-1">
        <ChatMarkdown text={text} />
        <CopyButton text={text} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), COPY_RESET_MS);
      }}
      className="focus-ring -ml-1.5 flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink group-hover:opacity-100"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function ThinkingIndicator({ activity }: { activity: string[] }) {
  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-sky to-deep">
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
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--sky), transparent 72%)' }}
      />
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0"
        style={{
          maskImage: 'radial-gradient(60% 55% at 50% 42%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(60% 55% at 50% 42%, black, transparent)',
        }}
      />
      <div className="animate-rise relative max-w-lg">
        <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[30px]">
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
              className="focus-ring rounded-card border bg-surface px-4 py-3.5 text-left shadow-card transition-colors duration-[var(--dur-fast)] hover:border-accent-line hover:bg-accent-soft"
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  return (
    <form
      className="relative shrink-0 pb-6 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto h-24 max-w-sm rounded-full opacity-25 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, var(--sky), transparent 72%)' }}
      />
      <div className="relative flex items-end gap-2 rounded-card border bg-surface p-2 pl-4 shadow-card transition-shadow duration-[var(--dur-fast)] focus-within:border-accent/40 focus-within:shadow-card">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder="What do you want to understand?"
          className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] text-ink placeholder:text-faint focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-2.5 pb-1">
          <span className="hidden items-center gap-1 font-mono text-[11px] text-faint sm:flex">
            <kbd className="rounded-[4px] border bg-surface-soft px-1.5 py-0.5">⏎</kbd>
            to send
          </span>
          <Button
            type="submit"
            size="icon"
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="shrink-0"
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
