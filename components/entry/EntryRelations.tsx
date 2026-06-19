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

/**
 * Related entries as the entry's closing back-matter — grouped by relation
 * type, each a chip that carries you onward. Inline, never a sidebar.
 */
export function EntryRelations({ outgoing, incoming }: EntryRelationsProps) {
  const groups = buildGroups(outgoing, incoming);
  if (groups.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
        Related
      </h2>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="w-[7.5rem] shrink-0 text-[13px] text-muted">{group.label}</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {group.items.map((chip) => (
                <Link
                  key={chip.id}
                  href={`/entries/${chip.slug}`}
                  className="rounded-full border-thin bg-surface px-3 py-1 text-[13px] font-medium text-body transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                >
                  {chip.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
