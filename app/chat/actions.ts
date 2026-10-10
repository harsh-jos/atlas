'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiSend } from '@/lib/api';
import type { ChatTurn } from '@/lib/api-types';

export async function cancelTurn(turnId: string): Promise<ActionResult<ChatTurn>> {
  return attempt(() => apiSend<ChatTurn>('POST', `/agent/turns/${encodeURIComponent(turnId)}/cancel`));
}

/** Send one turn and refresh the saved session list. */
export async function sendTurn(sessionId: string, message: string, requestId: string): Promise<ActionResult<ChatTurn>> {
  const result = await attempt(async () => {
    return apiSend<ChatTurn>('POST', '/agent/chat', {
      session_id: sessionId,
      message,
      request_id: requestId,
    });
  });

  if (result.error === undefined) {
    revalidatePath('/', 'layout');
  }
  return result;
}
