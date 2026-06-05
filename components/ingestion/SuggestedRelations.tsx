'use client';

import { Badge } from '@/components/ui/Badge';
import type { SuggestedRelation } from '@/lib/ingestion-types';

interface SuggestedRelationsProps {
  relations: SuggestedRelation[];
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
}

const RELATION_LABELS: Record<string, string> = {
  PART_OF: 'Part of',
  USES: 'Uses',
  PREREQUISITE: 'Prerequisite',
  CONTRASTS: 'Contrasts',
  SEE_ALSO: 'See also',
};

const RELATION_VARIANTS: Record<string, 'default' | 'accent' | 'warning' | 'success' | 'secondary'> = {
  PART_OF: 'secondary',
  USES: 'accent',
  PREREQUISITE: 'success',
  CONTRASTS: 'warning',
  SEE_ALSO: 'default',
};

export function SuggestedRelations({ relations, onToggle, onRemove }: SuggestedRelationsProps) {
  if (relations.length === 0) {
    return (
      <div className="text-[13px] text-muted py-2">
        No relations suggested for this content.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {relations.map((rel, i) => (
        <div
          key={`${rel.candidateId}-${rel.relationType}`}
          className="flex items-start gap-3 rounded-lg border-thin bg-surface/50 p-3"
        >
          <input
            type="checkbox"
            checked={rel.approved}
            onChange={() => onToggle(i)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-accent"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={RELATION_VARIANTS[rel.relationType] ?? 'default'} className="shrink-0">
                {RELATION_LABELS[rel.relationType] ?? rel.relationType}
              </Badge>
              <span className="text-[13px] font-medium text-ink truncate">
                {rel.candidateTitle}
              </span>
            </div>
            {rel.rationale && (
              <p className="text-[12px] text-muted leading-relaxed">{rel.rationale}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="shrink-0 rounded-full p-1 text-faint hover:text-red-500 transition-colors"
            aria-label="Remove relation"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
