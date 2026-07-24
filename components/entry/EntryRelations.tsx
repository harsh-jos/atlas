import Link from 'next/link';
import type { Relation } from '@/lib/api-types';
import { SectionLabel } from '@/components/entry/SectionLabel';
import { RELATION_INCOMING_LABELS, RELATION_OUTGOING_LABELS } from '@/lib/relations';
import { cleanTitle } from '@/lib/utils';

export interface EntryRelationsProps {
  outgoing: Relation[];
  incoming: Relation[];
}

type Group = { label: string; items: Relation['artifact'][] };

function buildGroups(outgoing: Relation[], incoming: Relation[]): Group[] {
  const byLabel = new Map<string, Relation['artifact'][]>();

  const push = (label: string, relation: Relation) => {
    byLabel.set(label, [...(byLabel.get(label) ?? []), relation.artifact]);
  };

  for (const relation of outgoing) {
    push(RELATION_OUTGOING_LABELS[relation.relationType], relation);
  }

  for (const relation of incoming) {
    const label = RELATION_INCOMING_LABELS[relation.relationType];
    if (!label) continue; // skip SEE_ALSO incoming (already shown outgoing)
    push(label, relation);
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
      <SectionLabel>Related</SectionLabel>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="w-[7.5rem] shrink-0 text-[13px] text-muted">{group.label}</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {group.items.map((chip) => (
                <Link
                  key={chip.slug}
                  href={`/entries/${chip.slug}`}
                  className="rounded-full border-thin bg-surface px-3 py-1 text-[13px] font-medium text-body transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                >
                  {cleanTitle(chip.title)}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
