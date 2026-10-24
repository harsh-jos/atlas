'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  ArrowDown,
  SquarePen,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Textarea } from '@/components/shadcn/textarea';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import { sendTurn } from '@/app/chat/actions';
import { formatCredits } from '@/lib/credits';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { ChatActivity } from '@/components/chat/ChatActivity';
import type { ToolEvent } from '@/lib/chat-activity';
import { Button } from '@/components/ui/Button';
import type { ChatHistory, ChatMessage, ChatTurn, ChatModel } from '@/lib/api-types';

const MODELS: { id: ChatModel; label: string }[] = [
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
];

const COPY_RESET_MS = 1500;
const COMPOSER_MAX_HEIGHT = 160;

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

function historyWithoutLatestReply(snapshot: ChatHistory): Entry[] {
  if (snapshot.latestTurn?.reply) return snapshot.messages.slice(0, -1);
  // A latest turn without reply text shows usage beside its status below the messages.
  return snapshot.latestTurn ? snapshot.messages.map((message, index) =>
    index === snapshot.messages.length - 1 ? { ...message, creditsUsed: undefined } : message,
  ) : snapshot.messages;
}

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
  const [selectedModel, setSelectedModel] = useState<ChatModel>(initialSnapshot.latestTurn?.model ?? 'gemini-4-argon');
  const [historyPage, setHistoryPage] = useState(initialSnapshot);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(() => historyWithoutLatestReply(initialSnapshot));
  const [turn, setTurn] = useState<ChatTurn | null>(initialSnapshot.latestTurn);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const visibleEntries = useMemo(() => turn?.reply
    ? [...entries, { role: 'atlas' as const, text: turn.reply, creditsUsed: turn.creditsUsed, creditsPending: turn.creditsPending }]
    : entries, [entries, turn]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialSnapshot.latestTurn?.error ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const followBottomRef = useRef(true);
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [conversationCopied, setConversationCopied] = useState(false);
  const submissionRef = useRef<{ id: string; message: string; model?: ChatModel } | null>(null);
  const storageKey = `atlas-submission:${sessionId}`;
  const pending = submitting || isActive(turn);
  const creditBlocked = !historyPage.account.canChat;
  const activeTurnId = isActive(turn) ? turn?.id : null;

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const snapshot = await readSnapshot<ChatHistory>(
        `/api/chat/${encodeURIComponent(sessionId)}`,
        signal,
      );
      setEntries(historyWithoutLatestReply(snapshot));
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
        const submission = JSON.parse(saved) as { id: string; message: string; model?: ChatModel };
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
          if (submission.model) setSelectedModel(submission.model);
        }
      }
    } catch {
      /* Storage may be unavailable; the server still enforces request IDs. */
    }
  }, [storageKey, initialSnapshot.latestTurn?.requestId]);

  const say = useCallback(
    async (message: string) => {
      if (pending || creditBlocked) return;
      setError(null);
      setDraft(message);
      followBottomRef.current = true;
      setSubmitting(true);
      const submission =
        submissionRef.current?.message === message
          ? submissionRef.current
          : { id: crypto.randomUUID(), message, model: turn?.model ?? selectedModel };
      submissionRef.current = submission;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(submission));
      } catch {
        /* Optional. */
      }
      try {
        const result = await sendTurn(sessionId, message, submission.id, submission.model);
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
        setEntries((current) => [
          ...current,
          ...(turn?.reply ? [{ role: 'atlas' as const, text: turn.reply, creditsUsed: turn.creditsUsed, creditsPending: turn.creditsPending }] : []),
          { role: 'you', text: message },
        ]);
        setToolEvents([]);
        setTurn(result.value);
        if (!isActive(result.value)) {
          void refresh().catch(() => setError('Could not refresh credit usage. Reload to check it.'));
        }
      } catch {
        setError(
          'Could not confirm your submission. Send the same message again to check it safely.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, storageKey, pending, creditBlocked, turn, selectedModel, refresh],
  );

  // The first SSE request owns execution; reconnects replay saved events without rerunning it.
  useEffect(() => {
    if (!activeTurnId) return;
    const controller = new AbortController();
    const source = new EventSource(`/api/turns/${activeTurnId}/events`);
    let cursor = -1;
    source.onmessage = (message) => {
      const event = JSON.parse(message.data);
      const sequence = Number(message.lastEventId);
      if (event.type !== 'turn.snapshot' && sequence <= cursor) return;
      cursor = sequence;
      if (event.type === 'stream.conflict') {
        source.close();
        setError('This reply is open in another connection. Reload after it finishes.');
        return;
      }
      if (event.type === 'turn.snapshot') {
        const latest = event.turn as ChatTurn;
        setTurn(latest);
        setToolEvents(event.tools ?? []);
        setError(latest.error);
        if (!isActive(latest)) {
          source.close();
          void refresh().catch(() => setError('Could not refresh credit usage. Reload to check it.'));
          router.refresh();
        }
      } else if (event.type === 'agent.delta') {
        setTurn((current) => current && {
          ...current, reply: (current.reply ?? '') + event.text, toolName: null,
        });
      } else if (event.type === 'agent.message') {
        setTurn((current) => current && {
          ...current,
          reply: event.reply ?? [current.reply, event.text].filter(Boolean).join('\n\n'),
          toolName: null,
        });
      } else if (event.type === 'turn.status') {
        // A terminal status is immediately followed by its authoritative snapshot.
        if (event.status === 'running' || event.status === 'queued') {
          setTurn((current) => current && {
            ...current, status: event.status,
            cancelRequested: event.cancelRequested ?? current.cancelRequested,
          });
        }
      } else if (event.type === 'agent.tool' || event.type === 'agent.tool_result' || event.type === 'agent.tool_error') {
        setToolEvents((current) => [...current, event as ToolEvent].slice(-100));
        setTurn((current) => current && {
          ...current,
          toolName: event.type === 'agent.tool' ? event.name : null,
          toolErrors: event.type === 'agent.tool_error'
            ? [...current.toolErrors, { name: event.name, code: event.code, message: event.message }].slice(-10)
            : current.toolErrors,
        });
      }
    };
    source.onopen = () => setError(null);
    source.onerror = () => {
      if (!controller.signal.aborted)
        setError('Connection interrupted. Reconnecting to the reply…');
    };
    return () => {
      controller.abort();
      source.close();
    };
  }, [activeTurnId, router, refresh]);

  // A foreground return also picks up work submitted in another tab.
  useEffect(() => {
    const controller = new AbortController();
    const recover = () => {
      if (document.visibilityState === 'visible' && !activeTurnId) {
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
  }, [refresh, activeTurnId]);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    followBottomRef.current = true;
    setShowJump(false);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, []);

  // New replies follow the bottom only while the reader is already there.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || (visibleEntries.length === 0 && !pending)) return;
    const anchor = prependAnchorRef.current;
    if (anchor) {
      el.scrollTop = anchor.top + el.scrollHeight - anchor.height;
      prependAnchorRef.current = null;
      return;
    }
    if (!didMountRef.current || followBottomRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior:
          !didMountRef.current ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
    }
    didMountRef.current = true;
  }, [visibleEntries, toolEvents, pending]);

  const submit = useCallback(() => {
    const message = draft.trim();
    if (!message || pending) return;
    void say(message);
  }, [draft, pending, say]);

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
      const viewport = scrollRef.current;
      if (viewport)
        prependAnchorRef.current = {
          height: viewport.scrollHeight,
          top: viewport.scrollTop,
        };
      setEntries((current) => [...older.messages, ...current]);
      setHistoryPage(older);
    } catch {
      setError('Could not load earlier messages. Try again.');
    } finally {
      setLoadingEarlier(false);
    }
  }

  const isEmpty = visibleEntries.length === 0 && !pending;

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col bg-[#fdfdfd]">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4 sm:px-8">
        <h1 className="min-w-0 truncate text-[13px] font-medium text-ink">
          {visibleEntries[0]?.text || 'New conversation'}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          {visibleEntries.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                conversationCopied ? 'Conversation copied' : 'Copy conversation'
              }
              title="Copy conversation"
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    visibleEntries
                      .map(
                        (entry) =>
                          `${entry.role === 'you' ? 'You' : 'Atlas'}: ${entry.text}`,
                      )
                      .join('\n\n'),
                  )
                  .then(() => {
                    setConversationCopied(true);
                    setTimeout(
                      () => setConversationCopied(false),
                      COPY_RESET_MS,
                    );
                  })
                  .catch(() =>
                    setError('Could not copy the conversation. Try again.'),
                  );
              }}
            >
              {conversationCopied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="New conversation"
            title="New conversation"
            onClick={() => router.push('/chat')}
          >
            <SquarePen className="size-4" />
          </Button>
        </div>
      </header>
      <ScrollArea
        viewportRef={scrollRef}
        type="auto"
        className="min-h-0 flex-1"
        viewportClassName="px-4 sm:px-8 lg:px-10"
        onViewportScroll={(event) => {
          const el = event.currentTarget;
          const away = el.scrollHeight - el.scrollTop - el.clientHeight > 180;
          followBottomRef.current = !away;
          setShowJump(away);
        }}
      >
        <div className="mx-auto w-full max-w-[var(--chat-measure)]">
          {isEmpty ? (
            <EmptyState onPick={setDraft} />
          ) : (
            <div className="space-y-3 pb-4 pt-4">
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
                <MessageRow key={index} {...entry} />
              ))}
              <ChatActivity events={toolEvents} pending={isActive(turn) || (submitting && !turn)} />
              {turn?.reply && (
                <MessageRow role="atlas" text={turn.reply} creditsUsed={isActive(turn) ? undefined : turn.creditsUsed} creditsPending={turn.creditsPending} />
              )}
            </div>
          )}
          {turn && !isActive(turn) && !turn.reply && <CreditUsage used={turn.creditsUsed} pending={turn.creditsPending} />}
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
        </div>
      </ScrollArea>

      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={scrollToLatest}
            className="pointer-events-auto gap-1.5 rounded-full bg-white shadow-sm"
          >
            <ArrowDown className="size-3.5" />
            Back to latest
          </Button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[var(--chat-measure)] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-2 text-[11px] text-muted" aria-live="polite">
        <span>
          {formatCredits(historyPage.creditsUsed ?? 0)}{historyPage.creditsPending ? '+' : ''} credits this conversation · Estimated
        </span>
        <Link href="/profile" className="hover:text-ink">
          {historyPage.account.creditLimit == null ? `${formatCredits(historyPage.account.creditsUsed)} credits used · Unlimited` : `${formatCredits(historyPage.account.creditsRemaining ?? 0)} credits remaining`}
        </Link>
      </div>
      {creditBlocked && !pending && <p className="px-4 pt-2 text-center text-xs text-muted">
        {historyPage.account.creditsPending ? 'Some credit usage is pending or unavailable.' : 'You’ve used your free credits.'}{' '}
        <Link href="/profile" className="underline underline-offset-2">View account</Link>
      </p>}
      <Composer
        selectedModel={turn?.model ?? selectedModel}
        onModelChange={setSelectedModel}
        showModelSelector={!turn && entries.length === 0 && !pending}
        draft={draft}
        pending={pending || creditBlocked}
        onDraftChange={setDraft}
        onSubmit={submit}
      />
    </div>
  );
}

function MessageRow({ role, text, creditsUsed, creditsPending }: ChatMessage) {
  if (role === 'you') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[#eff0f2] px-3 py-1.5 text-sm leading-5 text-ink">
          {text}
        </div>
        {creditsUsed != null && <CreditUsage used={creditsUsed} pending={creditsPending} />}
      </div>
    );
  }

  return (
    <div className="group min-w-0">
      <ChatMarkdown text={text} />
      <div className="mt-2 flex items-center gap-3">
        <CreditUsage used={creditsUsed} pending={creditsPending} />
        <CopyButton text={text} />
      </div>
    </div>
  );
}

function CreditUsage({ used, pending }: { used?: number | null; pending?: boolean }) {
  if (used === undefined) return null;
  return <span className="text-[11px] text-faint">
    {used == null ? 'Credit usage unavailable' : `${formatCredits(used)}${pending ? '+' : ''} credits · Estimated`}
    {pending && ' · Some usage is unknown'}
  </span>;
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
      className="focus-ring -ml-1.5 flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-faint opacity-100 transition-opacity duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink group-hover:opacity-100"
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

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
      <div className="mb-4 flex size-10 items-center justify-center text-ink">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
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
            className="group rounded-xl border border-black/5 bg-white p-3 text-left transition-colors hover:border-black/10 hover:bg-black/[0.025]"
          >
            <span className="mb-2 flex items-center justify-between">
              <Icon className="size-4 text-muted" aria-hidden="true" />
              <ArrowUpRight className="size-3.5 text-faint group-hover:text-ink" />
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
  selectedModel: ChatModel;
  onModelChange: (model: ChatModel) => void;
  showModelSelector: boolean;
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

function Composer({
  selectedModel,
  onModelChange,
  showModelSelector,
  draft,
  pending,
  onDraftChange,
  onSubmit,
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
      className="relative shrink-0 px-4 pb-2 pt-2 sm:px-8 lg:px-10"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto w-full max-w-[var(--chat-measure)] rounded-2xl border border-black/10 bg-white px-3 py-1.5 shadow-[0_2px_8px_#00000003] transition-shadow focus-within:border-hairline-strong focus-within:shadow-[0_0_0_3px_#eaf6fd]">
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
          placeholder="Ask Atlas…"
          className="min-h-8 max-h-40 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 py-1.5 text-base text-ink shadow-none placeholder:text-faint focus-visible:ring-0"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          {showModelSelector ? (
            <Select value={selectedModel} onValueChange={(value) => onModelChange(value as ChatModel)}>
              <SelectTrigger size="sm" aria-label="Gemini model" className="border-0 px-1 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {MODELS.map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}
                <p className="max-w-56 px-2 py-2 text-[11px] text-muted">The model is fixed after your first message.</p>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted">{MODELS.find((model) => model.id === selectedModel)?.label}</span>
          )}
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[11px] text-faint sm:flex">
              <kbd className="rounded-[4px] border bg-surface-soft px-1.5 py-0.5">
                ⏎
              </kbd>
              send · Shift + Enter for a new line
            </span>
              <Button
                type="submit"
                size="icon"
                disabled={pending || !draft.trim()}
                aria-label="Send message"
                className="size-8 shrink-0 rounded-full"
              >
                <SendIcon />
              </Button>
          </div>
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
