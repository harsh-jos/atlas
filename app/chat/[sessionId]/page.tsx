import { ChatPanel } from '@/components/chat/ChatPanel';
import { apiGet } from '@/lib/api';
import type { ChatHistory } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

interface ChatPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { sessionId } = await params;
  // An unstarted session returns an empty history, so a fresh URL simply opens a blank chat.
  const { messages } = await apiGet<ChatHistory>(`/agent/chat/${encodeURIComponent(sessionId)}`);

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Learn something
          </span>
        </div>
        <h1 className="font-title text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
          What are you curious about?
        </h1>
      </header>
      <ChatPanel sessionId={sessionId} initialMessages={messages} />
    </div>
  );
}
