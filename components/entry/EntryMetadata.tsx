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

export function EntryMetadata({ metadata }: EntryMetadataProps) {
  const rows = toRows(metadata);

  if (rows.length === 0) {
    return null;
  }

  return (
    <aside className="rounded-2xl border-thin bg-surface p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">Details</h2>
      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px] uppercase tracking-[0.04em] text-faint">{row.label}</dt>
            <dd className="text-right text-[13px] font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
