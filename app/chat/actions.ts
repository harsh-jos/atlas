'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiGet, apiSend } from '@/lib/api';
import type { ImportSummary, LinkReport, PreviewDetail } from '@/lib/api-types';

/**
 * One turn with the agent. A turn can commit artifacts and always touches the session's
 * place in the sidebar history, so the whole layout is revalidated after.
 */
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

/** Propose connections for what was just kept. Slow — the caller shows progress meanwhile. */
export async function proposeLinks(conceptSlug: string): Promise<ActionResult<LinkReport>> {
  const result = await attempt(() =>
    apiSend<LinkReport>('POST', '/links/propose', { concept_slug: conceptSlug })
  );
  if (result.error === undefined) {
    revalidatePath('/graph');
  }
  return result;
}
