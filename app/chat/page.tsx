import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import type { ChatSessionSummary, ConversationAllowance } from '@/lib/api-types';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';

export const dynamic = 'force-dynamic';

/** Start a new conversation when allowed, or offer the user's existing chats. */
export default async function NewChatPage() {
  const allowance = await apiGet<ConversationAllowance>('/agent/conversations/allowance');
  if (allowance.canStart) redirect(`/chat/${randomUUID()}`);

  const sessions = await apiGet<ChatSessionSummary[]>('/agent/sessions');
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="Continue a conversation"
        description={`Your account has reached its limit of ${allowance.limit} conversations. Choose an existing conversation to keep exploring.`}
      />
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <Link
              href={`/chat/${encodeURIComponent(session.sessionId)}`}
              className="focus-ring block rounded-xl border bg-white px-4 py-3 text-sm text-ink hover:bg-accent-soft"
            >
              {session.firstMessage ?? 'Open conversation'}
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
