import db from '@/lib/db';

export interface EntrySearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED';
  updatedAt: Date;
  collectionName: string;
  collectionSlug: string;
  collectionColor: string | null;
  sourceCount: number;
  rank: number;
}

export interface NoteSearchResult {
  id: string;
  title: string;
  slug: string;
  body: string | null;
  updatedAt: Date;
  linkCount: number;
  rank: number;
}

export type UnifiedSearchResult =
  | ({
      entityType: 'ENTRY';
    } & EntrySearchResult)
  | ({
      entityType: 'NOTE';
      summary: string | null;
      tags: string[];
      status: 'DRAFT' | 'PUBLISHED';
      collectionName: string;
      collectionSlug: string;
      collectionColor: string | null;
      sourceCount: number;
    } & NoteSearchResult);

async function searchEntries(query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  return db.$queryRaw<EntrySearchResult[]>`
    SELECT
      e.id,
      e.title,
      e.slug,
      e.summary,
      e.tags,
      e.status,
      e."updatedAt",
      c.name AS "collectionName",
      c.slug AS "collectionSlug",
      c.color AS "collectionColor",
      COUNT(s.id)::int AS "sourceCount",
      ts_rank_cd(
        setweight(to_tsvector('english', coalesce(e.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(e.summary, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(e.body, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(e.tags, ' '), '')), 'B'),
        plainto_tsquery('english', ${normalizedQuery})
      ) AS rank
    FROM "Entry" e
    INNER JOIN "Collection" c ON c.id = e."collectionId"
    LEFT JOIN "Source" s ON s."entryId" = e.id
    WHERE
      (
        setweight(to_tsvector('english', coalesce(e.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(e.summary, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(e.body, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(e.tags, ' '), '')), 'B')
      ) @@ plainto_tsquery('english', ${normalizedQuery})
    GROUP BY e.id, c.id
    ORDER BY rank DESC, e."updatedAt" DESC
    LIMIT 25;
  `;
}

async function searchNotes(query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  return db.$queryRaw<NoteSearchResult[]>`
    SELECT
      n.id,
      n.title,
      n.slug,
      n.body,
      n."updatedAt",
      COUNT(nl.id)::int AS "linkCount",
      ts_rank_cd(
        setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(n.body, '')), 'B'),
        plainto_tsquery('english', ${normalizedQuery})
      ) AS rank
    FROM "Note" n
    LEFT JOIN "NoteLink" nl ON nl."noteId" = n.id
    WHERE
      (
        setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(n.body, '')), 'B')
      ) @@ plainto_tsquery('english', ${normalizedQuery})
    GROUP BY n.id
    ORDER BY rank DESC, n."updatedAt" DESC
    LIMIT 25;
  `;
}

export async function searchUnifiedContent(query: string): Promise<UnifiedSearchResult[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const [entries, notes] = await Promise.all([searchEntries(normalizedQuery), searchNotes(normalizedQuery)]);

  const entryResults: UnifiedSearchResult[] = entries.map((entry) => ({
    ...entry,
    entityType: 'ENTRY',
  }));

  const noteResults: UnifiedSearchResult[] = notes.map((note) => ({
    ...note,
    entityType: 'NOTE',
    summary: note.body,
    tags: [],
    status: 'PUBLISHED',
    collectionName: 'Personal notes',
    collectionSlug: 'notes',
    collectionColor: '#6e6e73',
    sourceCount: note.linkCount,
  }));

  return [...entryResults, ...noteResults]
    .sort((a, b) => {
      if (b.rank !== a.rank) {
        return b.rank - a.rank;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, 40);
}

export function searchResultExcerpt(result: UnifiedSearchResult, query: string) {
  const sourceText = result.summary?.trim() || result.title;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const lowerSource = sourceText.toLowerCase();
  const firstMatch = terms
    .map((term) => lowerSource.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return truncate(sourceText, 180);
  }

  const start = Math.max(0, firstMatch - 70);
  const end = Math.min(sourceText.length, firstMatch + 120);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < sourceText.length ? '...' : '';

  return `${prefix}${sourceText.slice(start, end)}${suffix}`;
}

function truncate(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length - 3)}...`;
}
