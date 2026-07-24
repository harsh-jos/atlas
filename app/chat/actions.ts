'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiGet, apiSend } from '@/lib/api';
import type { ImportSummary, PreviewDetail } from '@/lib/api-types';

/** One turn with the agent. A turn can commit artifacts, so the library is revalidated after. */
export async function sendTurn(sessionId: string, message: string): Promise<ActionResult<string>> {
  const result = await attempt(async () => {
    const { reply } = await apiSend<{ reply: string }>('POST', '/agent/chat', {
      session_id: sessionId,
      message,
    });
    return reply;
  });

  if (result.error === undefined) {
    revalidatePath('/');
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

/** What a source would become, so the choice can be made against artifacts rather than prose. */
export async function loadPreview(previewId: string): Promise<ActionResult<PreviewDetail>> {
  return attempt(() => apiGet<PreviewDetail>(`/previews/${previewId}`));
}

/** Keep only the chosen artifacts. Refused server-side if nothing is selected. */
export async function commitPreview(
  previewId: string,
  sourceKeys: string[]
): Promise<ActionResult<ImportSummary>> {
  const result = await attempt(() =>
    apiSend<ImportSummary>('POST', `/previews/${previewId}/commit`, { source_keys: sourceKeys })
  );
  if (result.error === undefined) {
    revalidatePath('/');
  }
  return result;
}

export async function discardPreview(previewId: string): Promise<ActionResult<void>> {
  return attempt(() => apiSend<void>('DELETE', `/previews/${previewId}`));
}
