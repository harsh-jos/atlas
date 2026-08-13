'use server';

import { revalidatePath } from 'next/cache';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiGet, apiPost } from '@/lib/api';
import type { KbBuildStarted, KbBuildStatus } from '@/lib/api-types';

export interface StartBuildInput {
  url: string;
  goal?: string;
  provider?: string;
  model?: string;
}

/** Kick off a build; the backend validates the provider before accepting. */
export async function startBuild(input: StartBuildInput): Promise<ActionResult<string>> {
  return attempt(async () => {
    const { id } = await apiPost<KbBuildStarted>('/kb/builds', input);
    return id;
  });
}

/** One poll of a running build. A finished build refreshes the library. */
export async function buildStatus(id: string): Promise<ActionResult<KbBuildStatus>> {
  const result = await attempt(() => apiGet<KbBuildStatus>(`/kb/builds/${id}`));
  if (result.value?.status === 'done') {
    revalidatePath('/');
  }
  return result;
}
