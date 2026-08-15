import { ChevronDown } from 'lucide-react';
import { cleanTitle } from '@/lib/utils';

export interface EntryMetadataProps {
  metadata: Record<string, unknown> | null;
}

interface MetaRow {
  label: string;
  value: string;
}

// Ingestion plumbing — meaningful to the importer, noise to a reader. Kept out
// of the reader-facing "Details" list.
const INTERNAL_METADATA_KEYS = new Set(['importId', 'sourceKey', 'sourceKind', 'headingLevel']);

// Past this many fields, Details opens collapsed — all of it is still there,
// just not dumped open by default on every artifact.
const COLLAPSE_THRESHOLD = 3;

// "arxivId" -> "Arxiv id", "year" -> "Year"
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toRows(metadata: Record<string, unknown> | null): MetaRow[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .map(([key, raw]): MetaRow | null => {
      if (INTERNAL_METADATA_KEYS.has(key)) return null;
      if (raw === null || raw === undefined || raw === '') return null;
      const value =
        typeof raw === 'string'
          ? cleanTitle(raw)
          : typeof raw === 'number' || typeof raw === 'boolean'
            ? String(raw)
            : JSON.stringify(raw);
      return { label: humanizeKey(key), value };
    })
    .filter((row): row is MetaRow => row !== null);
}

/**
 * Entry-specific structured data (the jsonb escape hatch) as a quiet detail
 * grid in the closing back-matter. A handful of fields sit open; past
 * {@link COLLAPSE_THRESHOLD} it collapses behind a native `<details>` toggle —
 * ingestion pipelines routinely stamp 6-8 fields (model, scope, seed URL...)
 * and dumping all of them open dominates the page.
 */
export function EntryMetadata({ metadata }: EntryMetadataProps) {
  const rows = toRows(metadata);
  if (rows.length === 0) return null;

  const grid = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-baseline gap-3 text-[13.5px] leading-6">
          <dt className="w-[6.5rem] shrink-0 font-mono text-[11.5px] text-faint">{row.label}</dt>
          <dd className="min-w-0 truncate text-ink" title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (rows.length <= COLLAPSE_THRESHOLD) {
    return (
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
            Details
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
        </div>
        {grid}
      </section>
    );
  }

  return (
    <section>
      <details className="group">
        <summary className="focus-ring mb-3 flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
            Details &middot; {rows.length}
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-[var(--dur-fast)] group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        {grid}
      </details>
    </section>
  );
}
