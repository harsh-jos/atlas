import { NextResponse } from 'next/server';
import { searchEntryRelationCandidates, type RelationCandidate } from '@/lib/entry-data';
import { cleanTitle } from '@/lib/utils';

/**
 * Typeahead for the entry editor's relation picker. Returns a short, title-matched
 * list of candidate entries so the editor never has to load the whole library.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  const exclude = searchParams.get('exclude') ?? '';

  const candidates = await searchEntryRelationCandidates(query, exclude);

  const results: RelationCandidate[] = candidates.map((candidate) => ({
    id: candidate.id,
    title: cleanTitle(candidate.title),
    collectionColor: candidate.collection.color,
  }));

  return NextResponse.json(results);
}
