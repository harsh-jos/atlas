'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiSend } from '@/lib/api';

/** Send one turn and refresh the saved session list. */
export async function sendTurn(sessionId: string, message: string): Promise<ActionResult<string>> {
  const result = await attempt(async () => {
    const { reply } = await apiSend<{ reply: string }>('POST', '/agent/chat', {
      session_id: sessionId,
      message,
    });
    return reply;
  });

  if (result.error === undefined) {
    revalidatePath('/', 'layout');
  }
  return result;
}

/**
 * A brief ticket for opening the progress socket. The session cookie is httpOnly, so the
 * browser can never build the socket URL itself.
 */
export async function socketTicket(): Promise<ActionResult<string>> {
  return attempt(async () => {
    const { ticket } = await apiSend<{ ticket: string }>('POST', '/auth/socket-ticket');
    return ticket;
  });
}
