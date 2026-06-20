'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { RelationCandidate } from '@/lib/entry-data';
import { cn } from '@/lib/utils';

export interface RelationTargetComboboxProps {
  /** The currently chosen target (empty `toId` means nothing picked yet). */
  value: { toId: string; toTitle: string; toCollectionColor: string | null };
  /** Entry to keep out of results — an entry can't relate to itself. */
  excludeId: string;
  onSelect: (candidate: RelationCandidate) => void;
}

const SEARCH_DEBOUNCE_MS = 180;

/**
 * A typeahead picker for a relation's target entry. Searches the library on the
 * server as you type, so the editor never loads thousands of options at once.
 */
export function RelationTargetCombobox({ value, excludeId, onSelect }: RelationTargetComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<RelationCandidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Fetch matches (debounced) whenever the dropdown is open and the query changes.
  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, exclude: excludeId });
        const response = await fetch(`/api/entries/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Relation search failed');
        const data = (await response.json()) as RelationCandidate[];
        setResults(data);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, excludeId]);

  // Close when clicking outside the picker.
  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function handleSelect(candidate: RelationCandidate) {
    onSelect(candidate);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
              } else if (event.key === 'Enter' && results[0]) {
                event.preventDefault();
                handleSelect(results[0]);
              }
            }}
            placeholder="Search entries…"
            className="h-9 w-full rounded-lg border-thin bg-surface pl-8 pr-2 text-xs text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setResults([]);
            setLoading(true);
            setOpen(true);
          }}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border-thin bg-surface px-2.5 text-xs text-ink transition-colors hover:bg-surface-soft"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value.toId && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: value.toCollectionColor || 'var(--faint)' }}
              />
            )}
            <span className={cn('truncate', !value.toId && 'text-faint')}>
              {value.toId ? value.toTitle : 'Select an entry…'}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border-thin bg-surface py-1 shadow-card-hover">
          {loading ? (
            <p className="px-3 py-2 text-xs text-faint">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">No matching entries.</p>
          ) : (
            results.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => handleSelect(candidate)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-soft"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: candidate.collectionColor || 'var(--faint)' }}
                />
                <span className="flex-1 truncate">{candidate.title}</span>
                {candidate.id === value.toId && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
