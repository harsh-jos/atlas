import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { EntryRelationCandidate } from '@/lib/entry-data';

export type EditableRelationType =
  | 'PART_OF'
  | 'USES'
  | 'PREREQUISITE'
  | 'CONTRASTS'
  | 'SEE_ALSO';

export interface EditableRelation {
  id: string;
  toId: string;
  relationType: EditableRelationType;
  note: string;
}

export interface EntryRelationEditorProps {
  relations: EditableRelation[];
  candidates: EntryRelationCandidate[];
  onChange: (relations: EditableRelation[]) => void;
}

const relationTypes: EditableRelationType[] = [
  'PART_OF',
  'USES',
  'PREREQUISITE',
  'CONTRASTS',
  'SEE_ALSO',
];

export function EntryRelationEditor({
  relations,
  candidates,
  onChange,
}: EntryRelationEditorProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-zinc-900">Relations</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={addRelation}
          disabled={candidates.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Add relation
        </Button>
      </div>

      {relations.length > 0 ? (
        <div className="grid gap-3">
          {relations.map((relation, index) => (
            <div key={relation.id} className="rounded-lg border-thin border-zinc-200/80 bg-white p-3">
              <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
                <select
                  value={relation.relationType}
                  onChange={(event) => updateRelation(index, 'relationType', event.target.value)}
                  className="h-9 rounded-md border-thin border-zinc-200 bg-white px-2 text-xs text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                >
                  {relationTypes.map((relationType) => (
                    <option key={relationType} value={relationType}>
                      {relationType.toLowerCase().replace('_', ' ')}
                    </option>
                  ))}
                </select>

                <select
                  value={relation.toId}
                  onChange={(event) => updateRelation(index, 'toId', event.target.value)}
                  className="h-9 rounded-md border-thin border-zinc-200 bg-white px-2 text-xs text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                >
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => removeRelation(index)}
                  className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Remove relation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={relation.note}
                onChange={(event) => updateRelation(index, 'note', event.target.value)}
                placeholder="Optional note"
                className="mt-3"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border-thin border-zinc-200/80 bg-white p-4">
          <p className="text-sm text-zinc-500">No outgoing relations yet.</p>
        </div>
      )}
    </section>
  );

  function addRelation() {
    const firstCandidate = candidates[0];

    if (!firstCandidate) {
      return;
    }

    onChange([
      ...relations,
      {
        id: crypto.randomUUID(),
        toId: firstCandidate.id,
        relationType: 'SEE_ALSO',
        note: '',
      },
    ]);
  }

  function removeRelation(index: number) {
    onChange(relations.filter((_, relationIndex) => relationIndex !== index));
  }

  function updateRelation(index: number, key: keyof EditableRelation, value: string) {
    onChange(
      relations.map((relation, relationIndex) =>
        relationIndex === index ? { ...relation, [key]: value } : relation
      )
    );
  }
}
