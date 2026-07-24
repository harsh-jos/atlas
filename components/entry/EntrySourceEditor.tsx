import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { SourceDraft } from '@/app/entries/actions';
import type { SourceType } from '@/lib/api-types';

export interface EntrySourceEditorProps {
  sources: SourceDraft[];
  onChange: (sources: SourceDraft[]) => void;
}

const sourceTypes: SourceType[] = ['BOOK', 'PAPER', 'DOCS', 'TUTORIAL', 'COURSE', 'WEBSITE'];

export function EntrySourceEditor({ sources, onChange }: EntrySourceEditorProps) {
  function updateSource(index: number, patch: Partial<SourceDraft>) {
    onChange(sources.map((source, at) => (at === index ? { ...source, ...patch } : source)));
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Sources</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            onChange([
              ...sources,
              { sourceType: 'PAPER', title: '', author: '', url: '', ref: '' },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add source
        </Button>
      </div>

      {sources.length > 0 ? (
        <div className="grid gap-3">
          {sources.map((source, index) => (
            <div key={index} className="rounded-xl border-thin bg-surface p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <select
                  value={source.sourceType}
                  onChange={(event) =>
                    updateSource(index, { sourceType: event.target.value as SourceType })
                  }
                  className="h-8 rounded-lg border-thin bg-surface px-2 text-xs text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
                >
                  {sourceTypes.map((sourceType) => (
                    <option key={sourceType} value={sourceType}>
                      {sourceType.toLowerCase()}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChange(sources.filter((_, at) => at !== index))}
                  className="rounded-md p-1.5 text-faint transition-colors hover:bg-black/[0.04] hover:text-ink"
                  aria-label="Remove source"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={source.title}
                  onChange={(event) => updateSource(index, { title: event.target.value })}
                  placeholder="Title"
                />
                <Input
                  value={source.author}
                  onChange={(event) => updateSource(index, { author: event.target.value })}
                  placeholder="Author"
                />
                <Input
                  value={source.url}
                  onChange={(event) => updateSource(index, { url: event.target.value })}
                  placeholder="URL"
                />
                <Input
                  value={source.ref}
                  onChange={(event) => updateSource(index, { ref: event.target.value })}
                  placeholder="Chapter, page, or section"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-thin bg-surface p-4">
          <p className="text-sm text-muted">No sources yet.</p>
        </div>
      )}
    </section>
  );
}
