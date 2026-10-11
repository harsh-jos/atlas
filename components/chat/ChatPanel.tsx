'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Sparkles,
  ArrowUpRight,
  Code2,
  Lightbulb,
  Network,
  BookOpen,
} from 'lucide-react';
import { Textarea } from '@/components/shadcn/textarea';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import { cancelTurn, sendTurn } from '@/app/chat/actions';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { Button } from '@/components/ui/Button';
import type { ChatHistory, ChatMessage, ChatTurn } from '@/lib/api-types';

const POLL_MS = 1500;
const COPY_RESET_MS = 1500;
const COMPOSER_MAX_HEIGHT = 160;

/** What each tool call is called while the reader waits — the agent's work, made legible. */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: 'Finding saved explanations',
  researcher: 'Checking sources',
  inspect_concept_graph: 'Looking at connected ideas',
  remember_concept: 'Keeping this idea',
  connect_concepts: 'Connecting ideas',
  read_saved_explanation: 'Reading a saved explanation',
  save_explanation: 'Saving your explanation',
  revise_saved_explanation: 'Updating your explanation',
};

/** The first-run moment — three or four honest ways to start a research thread. */
const STARTER_PROMPTS = [
  {
    icon: Code2,
    label: 'Make sense of code',
    prompt:
      'Help me understand how PyTorch autograd works with a small example',
  },
  {
    icon: Lightbulb,
    label: 'Untangle an idea',
    prompt:
      'Explain how transformer attention works, starting with the intuition',
  },
  {
    icon: Network,
    label: 'Connect the dots',
    prompt: 'How are gradient descent and backpropagation connected?',
  },
  {
    icon: BookOpen,
    label: 'Follow your curiosity',
    prompt: 'Teach me the CAP theorem with a concrete example',
  },
];

type Entry = ChatMessage;

export interface ChatPanelProps {
  /** The session this chat continues — it lives in the URL so a reload reopens the conversation. */
  sessionId: string;
  /** Turns already stored for this session, replayed so a reopened URL is not blank. */
  initialSnapshot: ChatHistory;
}

function isActive(turn: ChatTurn | null) {
  return turn?.status === 'queued' || turn?.status === 'running';
}

async function readSnapshot<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Could not check the reply. Reconnecting…');
  return response.json() as Promise<T>;
}

export function ChatPanel({ sessionId, initialSnapshot }: ChatPanelProps) {
  const router = useRouter();
  const [historyPage, setHistoryPage] = useState(initialSnapshot);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(initialSnapshot.messages);
  const [turn, setTurn] = useState<ChatTurn | null>(initialSnapshot.latestTurn);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(
    initialSnapshot.latestTurn?.error ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const submissionRef = useRef<{ id: string; message: string } | null>(null);
  const storageKey = `atlas-submission:${sessionId}`;
  const pending = submitting || isActive(turn);
  const activeTurnId = isActive(turn) ? turn?.id : null;
  const activity = turn?.toolName
    ? [TOOL_LABELS[turn.toolName] ?? turn.toolName]
    : [];

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const snapshot = await readSnapshot<ChatHistory>(
        `/api/chat/${encodeURIComponent(sessionId)}`,
        signal,
      );
      setEntries(snapshot.messages);
      setHistoryPage(snapshot);
      setTurn(snapshot.latestTurn);
      setError(snapshot.latestTurn?.error ?? null);
      if (
        submissionRef.current &&
        snapshot.latestTurn?.requestId === submissionRef.current.id
      ) {
        submissionRef.current = null;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Optional. */
        }
        setDraft('');
      }
    },
    [sessionId, storageKey],
  );

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const submission = JSON.parse(saved) as { id: string; message: string };
        if (
          typeof submission.id === 'string' &&
          typeof submission.message === 'string'
        ) {
          if (initialSnapshot.latestTurn?.requestId === submission.id) {
            sessionStorage.removeItem(storageKey);
            return;
          }
          submissionRef.current = submission;
          // Storage is browser-only; restore once after the server render has hydrated.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDraft(submission.message);
        }
      }
    } catch {
      /* Storage may be unavailable; the server still enforces request IDs. */
    }
  }, [storageKey, initialSnapshot.latestTurn?.requestId]);

  const say = useCallback(
    async (message: string) => {
      if (pending) return;
      setError(null);
      setDraft(message);
      setSubmitting(true);
      const submission =
        submissionRef.current?.message === message
          ? submissionRef.current
          : { id: crypto.randomUUID(), message };
      submissionRef.current = submission;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(submission));
      } catch {
        /* Optional. */
      }
      try {
        const result = await sendTurn(sessionId, message, submission.id);
        if (result.error !== undefined) {
          setError(result.error);
          return;
        }
        submissionRef.current = null;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Optional. */
        }
        setDraft('');
        setTurn(result.value);
        try {
          await refresh();
        } catch {
          setError('Your message was accepted. Reconnecting…');
        }
      } catch {
        setError(
          'Could not confirm your submission. Send the same message again to check it safely.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, storageKey, pending, refresh],
  );

  // Poll only an active turn. Reads never resubmit a message or restart generation.
  useEffect(() => {
    if (!activeTurnId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const latest = await readSnapshot<ChatTurn>(
          `/api/turns/${activeTurnId}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!isActive(latest)) {
          await refresh(controller.signal);
          router.refresh();
          return;
        }
        setTurn(latest);
        setError(latest.error);
      } catch {
        if (controller.signal.aborted) return;
        setError('Could not check the reply. Reconnecting…');
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeTurnId, refresh, router]);

  // A foreground return also picks up work submitted in another tab.
  useEffect(() => {
    const controller = new AbortController();
    const recover = () => {
      if (document.visibilityState === 'visible') {
        void refresh(controller.signal).catch(() => {
          if (!controller.signal.aborted)
            setError(
              'Could not refresh the conversation. Check your connection.',
            );
        });
      }
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('online', recover);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('online', recover);
    };
  }, [refresh]);

  // Scrolls only this container — never the app-wide scroll region above it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || (entries.length === 0 && !pending)) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: didMountRef.current ? 'smooth' : 'auto',
    });
    didMountRef.current = true;
  }, [entries, turn?.toolName, pending]);

  const submit = useCallback(() => {
    const message = draft.trim();
    if (!message || pending) return;
    void say(message);
  }, [draft, pending, say]);

  const stop = async () => {
    if (!activeTurnId || stopping || turn?.cancelRequested) return;
    setStopping(true);
    try {
      const result = await cancelTurn(activeTurnId);
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      setTurn(result.value);
      if (!isActive(result.value)) await refresh();
    } catch {
      setError('Could not confirm Stop. You can try again safely.');
    } finally {
      setStopping(false);
    }
  };

  async function loadEarlier() {
    if (loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const query = new URLSearchParams({
        legacy_offset: String(historyPage.nextLegacyOffset ?? 0),
      });
      if (historyPage.nextBefore) query.set('before', historyPage.nextBefore);
      const older = await readSnapshot<ChatHistory>(
        `/api/chat/${encodeURIComponent(sessionId)}?${query}`,
      );
      setEntries((current) => [...older.messages, ...current]);
      setHistoryPage(older);
    } catch {
      setError('Could not load earlier messages. Try again.');
    } finally {
      setLoadingEarlier(false);
    }
  }

  const isEmpty = entries.length === 0 && !pending;

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <ScrollArea
        viewportRef={scrollRef}
        type="auto"
        className="min-h-0 flex-1"
        viewportClassName="px-4 sm:px-6"
      >
        {isEmpty ? (
          <EmptyState onPick={setDraft} />
        ) : (
          <div className="space-y-4 pb-3 pt-5">
            {historyPage.hasMore && (
              <Button
                type="button"
                disabled={loadingEarlier}
                onClick={() => void loadEarlier()}
              >
                {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
              </Button>
            )}
            {entries.map((entry, index) => (
              <MessageRow key={index} role={entry.role} text={entry.text} />
            ))}

            {pending && <ThinkingIndicator activity={activity} />}
          </div>
        )}
        {error && (
          <p role="alert" className="px-1 pb-3 text-[13px] text-danger">
            {error}
          </p>
        )}
        {!!turn?.toolErrors.length && (
          <p role="status" className="px-1 pb-3 text-[13px] text-danger">
            Some saved-knowledge operations reported errors:{' '}
            {turn.toolErrors.map((issue) => issue.message).join(' ')} Reference:{' '}
            {turn.id}
          </p>
        )}
        {turn && (turn.error || turn.status === 'incomplete') && (
          <p className="pb-4 font-mono text-[11px] text-faint">
            {turn.errorCode ?? turn.status} · Reference: {turn.id}
          </p>
        )}
      </ScrollArea>

      <Composer
        draft={draft}
        pending={pending}
        onDraftChange={setDraft}
        onSubmit={submit}
        onStop={activeTurnId ? () => void stop() : undefined}
        stopping={stopping || (!!turn?.cancelRequested && isActive(turn))}
      />
    </div>
  );
}

function MessageRow({ role, text }: { role: 'you' | 'atlas'; text: string }) {
  if (role === 'you') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-accent-line/50 bg-accent-soft px-3.5 py-2 text-sm leading-relaxed text-ink">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Sparkles className="size-4" aria-hidden="true" />
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
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_RESET_MS);
          })
          .catch(() => setCopied(false));
      }}
      className="focus-ring -ml-1.5 flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-faint opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink group-hover:opacity-100"
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
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
          <p
            key={index}
            className="animate-rise font-mono text-[11.5px] text-faint"
          >
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
    <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
        Room for a new idea
      </p>
      <h1 className="max-w-lg text-[26px] font-medium leading-tight tracking-[-0.04em] sm:text-[30px]">
        What would you like
        <br />
        to understand?
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-6 text-muted">
        Start with a question, a half-formed thought, or something that doesn’t
        quite click. We’ll take it from there.
      </p>
      <div className="mt-6 grid w-full max-w-3xl gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STARTER_PROMPTS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(prompt)}
            className="group rounded-lg border bg-surface p-3 text-left transition-colors hover:border-accent-line hover:bg-accent-soft/40"
          >
            <span className="mb-2 flex items-center justify-between">
              <Icon className="size-4 text-accent" aria-hidden="true" />
              <ArrowUpRight className="size-3.5 text-faint group-hover:text-accent" />
            </span>
            <span className="block text-xs font-semibold text-ink">
              {label}
            </span>
            <span className="mt-1 block text-[11px] leading-5 text-muted">
              {prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ComposerProps {
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  stopping: boolean;
}

function Composer({
  draft,
  pending,
  onDraftChange,
  onSubmit,
  onStop,
  stopping,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  return (
    <form
      className="relative shrink-0 px-4 pb-2 pt-2 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative flex items-end gap-2 rounded-xl border border-hairline-strong bg-white p-2 pl-3 shadow-[0_4px_20px_#1b2b3e06] transition-shadow focus-within:border-accent-line focus-within:ring-4 focus-within:ring-accent-soft">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          aria-label="Message Atlas"
          placeholder="What do you want to understand?"
          className="min-h-8 max-h-40 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 py-2 text-base text-ink shadow-none sm:text-sm placeholder:text-faint focus-visible:ring-0"
        />
        <div className="flex shrink-0 items-center gap-2.5 pb-1">
          <span className="hidden items-center gap-1 font-mono text-[11px] text-faint sm:flex">
            <kbd className="rounded-[4px] border bg-surface-soft px-1.5 py-0.5">
              ⏎
            </kbd>
            to send
          </span>
          {onStop ? (
            <Button type="button" onClick={onStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop'}
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={pending || !draft.trim()}
              aria-label="Send message"
              className="shrink-0"
            >
              <SendIcon />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] leading-5 text-faint">
        Atlas can make mistakes. Check sources for important details.
      </p>
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
