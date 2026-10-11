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
 * Entry-specific structured data (the jsonb escape hatch) as the last, densest
 * line of the footer. A handful of fields sit open inline; past
 * {@link COLLAPSE_THRESHOLD} it collapses behind a native `<details>` toggle —
 * ingestion pipelines routinely stamp 6-8 fields (model, scope, seed URL...)
 * and dumping all of them open would dominate an otherwise one-line footer.
 */
export function EntryMetadata({ metadata }: EntryMetadataProps) {
  const rows = toRows(metadata);
  if (rows.length === 0) return null;

  const list = (
    <span className="text-muted">
      {rows.map((row, index) => (
        <span key={row.label}>
          {index > 0 && ' · '}
          <span className="text-faint">{row.label}:</span> {row.value}
        </span>
      ))}
    </span>
  );

  if (rows.length <= COLLAPSE_THRESHOLD) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-6">
        <span className="shrink-0 font-sans text-xs font-medium text-faint">
          Details
        </span>
        {list}
      </div>
    );
  }

  return (
    <details className="group text-[13px] leading-6">
      <summary className="focus-ring flex cursor-pointer list-none items-baseline gap-1.5 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 font-sans text-xs font-medium text-faint">
          Details
        </span>
        <span className="text-faint">{rows.length} fields</span>
        <ChevronDown
          className="h-3 w-3 shrink-0 text-faint transition-transform duration-[var(--dur-fast)] group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-1.5">{list}</div>
    </details>
  );
}
