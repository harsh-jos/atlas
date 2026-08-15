import Link from 'next/link';
import type { Relation } from '@/lib/api-types';
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

/** One dense line per relation type in the footer — a label, then linked titles. */
export function EntryRelations({ outgoing, incoming }: EntryRelationsProps) {
  const groups = buildGroups(outgoing, incoming);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => (
        <div
          key={group.label}
          className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[13px] leading-6"
        >
          <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">
            {group.label}
          </span>
          {group.items.map((chip, index) => (
            <span key={chip.slug} className="inline-flex items-baseline">
              {index > 0 && (
                <span className="mr-1.5 text-faint" aria-hidden="true">
                  &middot;
                </span>
              )}
              <Link
                href={`/entries/${chip.slug}`}
                className="focus-ring rounded-sm text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
              >
                {cleanTitle(chip.title)}
              </Link>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
