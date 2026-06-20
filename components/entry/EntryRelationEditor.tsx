import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { RelationCandidate } from '@/lib/entry-data';
import { RelationTargetCombobox } from '@/components/entry/RelationTargetCombobox';

export type EditableRelationType =
  | 'PART_OF'
  | 'USES'
  | 'PREREQUISITE'
  | 'CONTRASTS'
  | 'SEE_ALSO';

export interface EditableRelation {
  id: string;
  toId: string;
  toTitle: string;
  toCollectionColor: string | null;
  relationType: EditableRelationType;
  note: string;
}

export interface EntryRelationEditorProps {
  relations: EditableRelation[];
  /** The entry being edited — excluded from target search (no self-relations). */
  excludeId: string;
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
  excludeId,
  onChange,
}: EntryRelationEditorProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Relations</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={addRelation}
        >
          <Plus className="h-3.5 w-3.5" />
          Add relation
        </Button>
      </div>

      {relations.length > 0 ? (
        <div className="grid gap-3">
          {relations.map((relation, index) => (
            <div key={relation.id} className="rounded-xl border-thin bg-surface p-3">
              <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
                <select
                  value={relation.relationType}
                  onChange={(event) => updateRelation(index, 'relationType', event.target.value)}
                  className="h-9 rounded-lg border-thin bg-surface px-2 text-xs text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15"
                >
                  {relationTypes.map((relationType) => (
                    <option key={relationType} value={relationType}>
                      {relationType.toLowerCase().replace('_', ' ')}
                    </option>
                  ))}
                </select>

                <RelationTargetCombobox
                  value={{
                    toId: relation.toId,
                    toTitle: relation.toTitle,
                    toCollectionColor: relation.toCollectionColor,
                  }}
                  excludeId={excludeId}
                  onSelect={(candidate) => updateRelationTarget(index, candidate)}
                />

                <button
                  type="button"
                  onClick={() => removeRelation(index)}
                  className="rounded-md p-2 text-faint transition-colors hover:bg-black/[0.04] hover:text-ink"
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
        <div className="rounded-xl border-thin bg-surface p-4">
          <p className="text-sm text-muted">No outgoing relations yet.</p>
        </div>
      )}
    </section>
  );

  function addRelation() {
    onChange([
      ...relations,
      {
        id: crypto.randomUUID(),
        toId: '',
        toTitle: '',
        toCollectionColor: null,
        relationType: 'SEE_ALSO',
        note: '',
      },
    ]);
  }

  function removeRelation(index: number) {
    onChange(relations.filter((_, relationIndex) => relationIndex !== index));
  }

  function updateRelation(
    index: number,
    key: 'relationType' | 'note',
    value: string
  ) {
    onChange(
      relations.map((relation, relationIndex) =>
        relationIndex === index ? { ...relation, [key]: value } : relation
      )
    );
  }

  function updateRelationTarget(index: number, candidate: RelationCandidate) {
    onChange(
      relations.map((relation, relationIndex) =>
        relationIndex === index
          ? {
              ...relation,
              toId: candidate.id,
              toTitle: candidate.title,
              toCollectionColor: candidate.collectionColor,
            }
          : relation
      )
    );
  }
}
