export interface EntryMetadataProps {
  metadata: unknown;
}

interface MetaRow {
  label: string;
  value: string;
}

// "arxivId" -> "Arxiv id", "year" -> "Year"
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toRows(metadata: unknown): MetaRow[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }

  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, raw]): MetaRow | null => {
      if (raw === null || raw === undefined || raw === '') return null;
      const value =
        typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : JSON.stringify(raw);
      return { label: humanizeKey(key), value };
    })
    .filter((row): row is MetaRow => row !== null);
}

/**
 * Entry-specific structured data (the jsonb escape hatch) as a quiet detail
 * list in the closing back-matter.
 */
export function EntryMetadata({ metadata }: EntryMetadataProps) {
  const rows = toRows(metadata);
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
        Details
      </h2>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 text-[14px] leading-6">
            <dt className="w-[7.5rem] shrink-0 text-muted">{row.label}</dt>
            <dd className="text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
