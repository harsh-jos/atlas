/** The sort/tag/page URL contract for a collection page — shared by the server
 * page and the client-side sort/tag menus so there's one place that builds
 * these links and one place that reads them back. */

export type CollectionSort = 'created_asc' | 'created_desc' | 'updated_desc' | 'title_asc';

export const DEFAULT_SORT: CollectionSort = 'created_asc';

// Oldest-first by default — that's the order the agent actually wrote these in.
export const SORT_OPTIONS: Array<{ label: string; value: CollectionSort }> = [
  { label: 'Oldest first', value: 'created_asc' },
  { label: 'Newest first', value: 'created_desc' },
  { label: 'Recently updated', value: 'updated_desc' },
  { label: 'Title, A–Z', value: 'title_asc' },
];

export function parseSort(value?: string): CollectionSort {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as CollectionSort)
    : DEFAULT_SORT;
}

export function collectionFilterHref(
  slug: string,
  options: {
    sort: CollectionSort;
    tag?: string;
    page?: number;
  }
): string {
  const searchParams = new URLSearchParams();

  if (options.sort !== DEFAULT_SORT) {
    searchParams.set('sort', options.sort);
  }

  if (options.tag) {
    searchParams.set('tag', options.tag);
  }

  if (options.page && options.page > 1) {
    searchParams.set('page', String(options.page));
  }

  const query = searchParams.toString();

  return query ? `/collections/${slug}?${query}` : `/collections/${slug}`;
}
