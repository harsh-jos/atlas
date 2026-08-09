import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RelationTargetCombobox } from '@/components/entry/RelationTargetCombobox';
import { SectionLabel } from '@/components/entry/SectionLabel';
import type { RelationDraft } from '@/app/entries/actions';
import type { RelationType } from '@/lib/api-types';
import { RELATION_OUTGOING_LABELS } from '@/lib/relations';
import { cleanTitle } from '@/lib/utils';

export interface EditableRelation extends RelationDraft {
  toTitle: string;
  toColor: string | null;
}

export interface EntryRelationEditorProps {
  relations: EditableRelation[];
  /** The entry being edited — excluded from target search (no self-relations). */
  excludeSlug: string;
  onChange: (relations: EditableRelation[]) => void;
}

const relationTypes = Object.keys(RELATION_OUTGOING_LABELS) as RelationType[];

export function EntryRelationEditor({
  relations,
  excludeSlug,
  onChange,
}: EntryRelationEditorProps) {
  function updateRelation(index: number, patch: Partial<EditableRelation>) {
    onChange(relations.map((relation, at) => (at === index ? { ...relation, ...patch } : relation)));
  }

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Relations</SectionLabel>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            onChange([
              ...relations,
              { toSlug: '', toTitle: '', toColor: null, relationType: 'SEE_ALSO', note: '' },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add relation
        </Button>
      </div>

      {relations.length > 0 ? (
        <div className="grid gap-3">
          {relations.map((relation, index) => (
            <div key={index} className="rounded-card border bg-surface p-3">
              <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
                <select
                  value={relation.relationType}
                  onChange={(event) =>
                    updateRelation(index, { relationType: event.target.value as RelationType })
                  }
                  className="focus-ring h-9 rounded-field border bg-surface px-2 text-xs text-ink transition-colors hover:border-hairline-strong"
                >
                  {relationTypes.map((relationType) => (
                    <option key={relationType} value={relationType}>
                      {RELATION_OUTGOING_LABELS[relationType]}
                    </option>
                  ))}
                </select>

                <RelationTargetCombobox
                  value={relation}
                  excludeSlug={excludeSlug}
                  onSelect={(candidate) =>
                    updateRelation(index, {
                      toSlug: candidate.slug,
                      toTitle: cleanTitle(candidate.title),
                      toColor: candidate.conceptColor,
                    })
                  }
                />

                <button
                  type="button"
                  onClick={() => onChange(relations.filter((_, at) => at !== index))}
                  className="focus-ring rounded-md p-2 text-faint transition-colors hover:bg-surface-soft hover:text-ink"
                  aria-label="Remove relation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={relation.note}
                onChange={(event) => updateRelation(index, { note: event.target.value })}
                placeholder="Optional note"
                className="mt-3"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-card border bg-surface p-4">
          <p className="text-sm text-muted">No outgoing relations yet.</p>
        </div>
      )}
    </section>
  );
}
