import Link from 'next/link';
import type { RelationType } from '@prisma/client';
import type { EntryArtifactData } from '@/lib/entry-data';

export interface EntryRelationsProps {
  outgoing: EntryArtifactData['relationsFrom'];
  incoming: EntryArtifactData['relationsTo'];
}

// Outgoing relations read from this entry's perspective.
const outgoingLabels: Record<RelationType, string> = {
  PART_OF: 'Part of',
  USES: 'Uses',
  PREREQUISITE: 'Prerequisite',
  CONTRASTS: 'Contrasts with',
  SEE_ALSO: 'See also',
};

// Incoming relations read with the inverse meaning. SEE_ALSO is omitted —
// it is always stored in both directions, so the outgoing list already covers it.
const incomingLabels: Partial<Record<RelationType, string>> = {
  PART_OF: 'Has parts',
  USES: 'Used by',
  PREREQUISITE: 'Required for',
  CONTRASTS: 'Contrasts with',
};

interface RelationChip {
  id: string;
  slug: string;
  title: string;
}

type Group = { label: string; items: RelationChip[] };

function buildGroups(
  outgoing: EntryArtifactData['relationsFrom'],
  incoming: EntryArtifactData['relationsTo']
): Group[] {
  const byLabel = new Map<string, RelationChip[]>();

  const push = (label: string, chip: RelationChip) => {
    byLabel.set(label, [...(byLabel.get(label) ?? []), chip]);
  };

  for (const relation of outgoing) {
    push(outgoingLabels[relation.relationType], {
      id: relation.id,
      slug: relation.to.slug,
      title: relation.to.title,
    });
  }

  for (const relation of incoming) {
    const label = incomingLabels[relation.relationType];
    if (!label) continue; // skip SEE_ALSO incoming (already shown outgoing)
    push(label, {
      id: relation.id,
      slug: relation.from.slug,
      title: relation.from.title,
    });
  }

  return [...byLabel.entries()].map(([label, items]) => ({ label, items }));
}

export function EntryRelations({ outgoing, incoming }: EntryRelationsProps) {
  const groups = buildGroups(outgoing, incoming);

  return (
    <aside className="rounded-2xl border-thin bg-surface p-5 lg:sticky lg:top-20">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">Relations</h2>
      {groups.length > 0 ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
                {group.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.items.map((chip) => (
                  <Link
                    key={chip.id}
                    href={`/entries/${chip.slug}`}
                    className="rounded-full border-thin bg-canvas px-3 py-1 text-[13px] font-medium text-body transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                  >
                    {chip.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted">No relations have been added yet.</p>
      )}
    </aside>
  );
}
