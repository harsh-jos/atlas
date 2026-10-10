'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionResult, attempt } from '@/lib/actions';
import { apiGet, apiSend, apiUpload } from '@/lib/api';
import type { ArtifactDetail, Relation, RelationType, SourceType } from '@/lib/api-types';

export interface SourceDraft {
  sourceType: SourceType;
  title: string;
  author: string;
  url: string;
  ref: string;
}

export interface RelationDraft {
  toSlug: string;
  relationType: RelationType;
  note: string;
}

export interface EntryDraft {
  expectedUpdatedAt: string;
  title: string;
  summary: string;
  body: string;
  bodyHtml: string;
  tags: string[];
  conceptId: string;
  sources: SourceDraft[];
  relations: RelationDraft[];
}

/** A relation-picker candidate — `GET /artifacts?q=`. */
export interface ArtifactOption {
  id: string;
  title: string;
  slug: string;
  conceptName: string;
  conceptColor: string | null;
}

const artifactPath = (slug: string) => `/artifacts/${encodeURIComponent(slug)}`;

const blankToNull = (value: string) => value.trim() || null;

const edgeKey = (edge: { toSlug: string; relationType: RelationType }) =>
  `${edge.relationType}:${edge.toSlug}`;

export async function saveEntry(slug: string, draft: EntryDraft): Promise<ActionResult<string>> {
  const path = artifactPath(slug);

  const result = await attempt(async () => {
    const saved = await apiSend<ArtifactDetail>('PATCH', path, {
      expectedUpdatedAt: draft.expectedUpdatedAt,
      title: draft.title.trim(),
      summary: blankToNull(draft.summary),
      body: draft.body,
      bodyHtml: blankToNull(draft.bodyHtml),
      tags: draft.tags,
      conceptId: draft.conceptId,
    });

    await apiSend<ArtifactDetail>(
      'PUT',
      `${path}/sources`,
      draft.sources
        .filter((source) => source.title.trim())
        .map((source) => ({
          sourceType: source.sourceType,
          title: source.title.trim(),
          author: blankToNull(source.author),
          url: blankToNull(source.url),
          ref: blankToNull(source.ref),
        }))
    );

    await syncRelations(path, saved.relationsFrom, draft.relations);
    return saved.updatedAt;
  });

  if (!result.error) revalidatePath(`/entries/${slug}`);
  return result;
}

/** Edges are immutable on the backend, so a changed note is a delete plus a re-add. */
async function syncRelations(path: string, current: Relation[], drafts: RelationDraft[]) {
  const wanted = drafts.filter((relation) => relation.toSlug);
  const notes = new Map(wanted.map((relation) => [edgeKey(relation), blankToNull(relation.note)]));

  for (const relation of current) {
    const edge = { toSlug: relation.artifact.slug, relationType: relation.relationType };
    if (notes.get(edgeKey(edge)) !== relation.note) {
      await apiSend('DELETE', `${path}/relations`, edge);
    }
  }

  for (const relation of wanted) {
    await apiSend('POST', `${path}/relations`, {
      toSlug: relation.toSlug,
      relationType: relation.relationType,
      note: blankToNull(relation.note),
    });
  }
}

export async function deleteEntry(slug: string, conceptSlug: string): Promise<ActionResult> {
  const result = await attempt(() => apiSend('DELETE', artifactPath(slug)));
  if (result.error) return result;

  revalidatePath(`/collections/${conceptSlug}`);
  redirect(`/collections/${conceptSlug}`);
}

/** Returns the asset's `/assets/{id}` URL, ready to drop into the markdown body. */
export async function uploadAsset(form: FormData): Promise<ActionResult<string>> {
  const result = await attempt(() => apiUpload<{ url: string }>('/assets', form));
  return result.error === undefined ? { value: result.value.url } : result;
}

export async function searchArtifacts(query: string): Promise<ArtifactOption[]> {
  return apiGet<ArtifactOption[]>(`/artifacts?${new URLSearchParams({ q: query })}`);
}
