import Link from 'next/link';
import type { RelationType } from '@prisma/client';
import type { EntryArtifactData } from '@/lib/entry-data';

export interface EntryRelationsProps {
  relations: EntryArtifactData['relationsFrom'];
}

const relationLabels: Record<RelationType, string> = {
  PART_OF: 'Part of',
  USES: 'Uses',
  PREREQUISITE: 'Prerequisite',
  CONTRASTS: 'Contrasts with',
  SEE_ALSO: 'See also',
};

export function EntryRelations({ relations }: EntryRelationsProps) {
  const groupedRelations = relations.reduce(
    (groups, relation) => {
      groups[relation.relationType] = [...(groups[relation.relationType] ?? []), relation];
      return groups;
    },
    {} as Partial<Record<RelationType, EntryArtifactData['relationsFrom']>>
  );

  return (
    <aside className="rounded-lg border-thin border-zinc-200/80 bg-white p-4 lg:sticky lg:top-20">
      <h2 className="mb-4 text-sm font-medium text-zinc-900">Relations</h2>
      {relations.length > 0 ? (
        <div className="space-y-5">
          {Object.entries(groupedRelations).map(([relationType, items]) => (
            <div key={relationType}>
              <h3 className="mb-2 text-[11px] font-medium text-zinc-400">
                {relationLabels[relationType as RelationType]}
              </h3>
              <div className="flex flex-wrap gap-2">
                {items?.map((relation) => (
                  <Link
                    key={relation.id}
                    href={`/entries/${relation.to.slug}`}
                    className="rounded-full border-thin border-zinc-200/80 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-900"
                  >
                    {relation.to.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-zinc-500">No relations have been added yet.</p>
      )}
    </aside>
  );
}
