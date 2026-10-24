'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiGet, apiSend } from '@/lib/api';
import type { ChatModel, ChatTurn, ChatSessionSummary } from '@/lib/api-types';

/** Send one turn and refresh the saved session list. */
export async function sendTurn(sessionId: string, message: string, requestId: string, model?: ChatModel): Promise<ActionResult<ChatTurn>> {
  const result = await attempt(async () => {
    return apiSend<ChatTurn>('POST', '/agent/chat', {
      session_id: sessionId,
      message,
      request_id: requestId,
      model,
    });
  });

  if (result.error === undefined) {
    revalidatePath('/', 'layout');
  }
  return result;
}


export async function loadOlderSessions(offset: number): Promise<ActionResult<ChatSessionSummary[]>> {
  return attempt(() => apiGet<ChatSessionSummary[]>(`/agent/sessions?offset=${Math.max(0, Math.floor(offset))}`));
}
