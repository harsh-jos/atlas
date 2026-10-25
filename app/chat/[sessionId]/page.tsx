import { ChatPanel } from '@/components/chat/ChatPanel';
import { apiGet } from '@/lib/api';
import type { ChatHistory } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

interface ChatPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{turn?: string; block?: string}>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { sessionId } = await params;
  // An unstarted session returns an empty history, so a fresh URL simply opens a blank chat.
  const snapshot = await apiGet<ChatHistory>(`/agent/chat/${encodeURIComponent(sessionId)}`);

  const query = await searchParams;
  if(query.turn && /^[0-9a-f-]{36}$/i.test(query.turn) && !snapshot.messages.some(m=>m.turnId===query.turn)) {
    const focused = await apiGet<ChatHistory['messages']>(`/agent/chat/${encodeURIComponent(sessionId)}/turn/${query.turn}`);
    snapshot.messages = [...focused, ...snapshot.messages];
  }
  return <ChatPanel key={sessionId} sessionId={sessionId} initialSnapshot={snapshot} />;
}
