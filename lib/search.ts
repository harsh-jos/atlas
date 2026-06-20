import db from '@/lib/db';

/** Upper bound on rows returned by a single search — see the LIMIT in the query. */
export const SEARCH_RESULT_LIMIT = 25;

export interface EntrySearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  updatedAt: Date;
  collectionName: string;
  collectionSlug: string;
  collectionColor: string | null;
  sourceCount: number;
  rank: number;
}

export async function searchEntries(query: string) {
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
    LIMIT ${SEARCH_RESULT_LIMIT};
  `;
}

export function searchResultExcerpt(result: EntrySearchResult, query: string) {
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
