import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** A bare /chat is a request for a new conversation: mint a session and put it in the URL. */
export default function NewChatPage() {
  redirect(`/chat/${randomUUID()}`);
}
