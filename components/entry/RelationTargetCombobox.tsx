'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { type ArtifactOption, searchArtifacts } from '@/app/entries/actions';
import { cn } from '@/lib/utils';

export interface RelationTargetComboboxProps {
  /** The currently chosen target (empty `toSlug` means nothing picked yet). */
  value: { toSlug: string; toTitle: string; toColor: string | null };
  /** Entry to keep out of results — an entry can't relate to itself. */
  excludeSlug: string;
  onSelect: (candidate: ArtifactOption) => void;
}

const SEARCH_DEBOUNCE_MS = 180;

/**
 * A typeahead picker for a relation's target entry. Searches the library through a
 * Server Action as you type, so the editor never loads thousands of options at once.
 */
export function RelationTargetCombobox({
  value,
  excludeSlug,
  onSelect,
}: RelationTargetComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<ArtifactOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    let stale = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const matches = await searchArtifacts(query).catch((): ArtifactOption[] => []);
      if (stale) return;
      setResults(matches.filter((candidate) => candidate.slug !== excludeSlug));
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [open, query, excludeSlug]);

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

  function handleSelect(candidate: ArtifactOption) {
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
            className="focus-ring h-9 w-full rounded-lg border-thin bg-surface pl-8 pr-2 text-xs text-ink"
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
          className="focus-ring flex h-9 w-full items-center justify-between gap-2 rounded-lg border-thin bg-surface px-2.5 text-xs text-ink transition-colors hover:border-hairline-strong hover:bg-surface-soft"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value.toSlug && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: value.toColor || 'var(--faint)' }}
              />
            )}
            <span className={cn('truncate', !value.toSlug && 'text-faint')}>
              {value.toSlug ? value.toTitle : 'Select an entry…'}
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
                className="focus-ring flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-soft"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: candidate.conceptColor || 'var(--faint)' }}
                />
                <span className="flex-1 truncate">{candidate.title}</span>
                {candidate.slug === value.toSlug && (
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
