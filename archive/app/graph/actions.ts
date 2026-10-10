'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiSend } from '@/lib/api';

/** Drop every machine-made edge. Hand-drawn ones are untouched — that is what labelling buys. */
export async function removeAutomaticLinks(): Promise<ActionResult<number>> {
  const result = await attempt(async () => {
    const { removed } = await apiSend<{ removed: number }>('DELETE', '/links/ai');
    return removed;
  });
  if (result.error === undefined) {
    revalidatePath('/graph');
  }
  return result;
}
