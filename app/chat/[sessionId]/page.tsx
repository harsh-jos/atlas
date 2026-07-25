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
    <div className="flex h-full flex-col">
      <ChatPanel sessionId={sessionId} initialMessages={messages} />
    </div>
  );
}
