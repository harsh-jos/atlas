import { cookies } from 'next/headers';
import { ApiError, TOKEN_COOKIE, apiGet } from '@/lib/api';
import type { ChatSessionSummary } from '@/lib/api-types';
import { ChatHistoryList } from './ChatHistoryList';

/** A logged-out request has nothing to list; a backend hiccup shouldn't break the whole app. */
async function loadSessions(): Promise<ChatSessionSummary[]> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return [];
  try {
    return await apiGet<ChatSessionSummary[]>('/agent/sessions');
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

/** Past conversations for the sidebar, fetched fresh on every navigation. */
export async function ChatHistory() {
  const sessions = await loadSessions();
  return <ChatHistoryList sessions={sessions} />;
}
