'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiSend } from '@/lib/api';

export interface ConceptDraft {
  name: string;
  description: string;
  color: string;
}

const payload = (draft: ConceptDraft) => ({
  name: draft.name.trim(),
  description: draft.description.trim() || null,
  color: draft.color,
});

const conceptPath = (slug: string) => `/concepts/${encodeURIComponent(slug)}`;

export async function updateConcept(slug: string, draft: ConceptDraft): Promise<ActionResult> {
  const result = await attempt(() => apiSend('PATCH', conceptPath(slug), payload(draft)));
  if (result.error) return result;

  revalidatePath('/');
  revalidatePath(`/collections/${slug}`);
  return { value: undefined };
}

export async function deleteConcept(slug: string): Promise<ActionResult> {
  const result = await attempt(() => apiSend('DELETE', conceptPath(slug)));
  if (result.error) return result;

  revalidatePath('/');
  redirect('/');
}
