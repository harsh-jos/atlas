import type { RelationType } from '@prisma/client';

// Outgoing relations read from the entry's own perspective.
export const RELATION_OUTGOING_LABELS: Record<RelationType, string> = {
  PART_OF: 'Part of',
  USES: 'Uses',
  PREREQUISITE: 'Prerequisite',
  CONTRASTS: 'Contrasts with',
  SEE_ALSO: 'See also',
};

// Incoming relations read with the inverse meaning. SEE_ALSO is omitted — it is
// always stored in both directions, so the outgoing list already covers it.
export const RELATION_INCOMING_LABELS: Partial<Record<RelationType, string>> = {
  PART_OF: 'Has parts',
  USES: 'Used by',
  PREREQUISITE: 'Required for',
  CONTRASTS: 'Contrasts with',
};

// Edge colors in the knowledge graph, one per relation type.
export const RELATION_COLORS: Record<RelationType, string> = {
  PART_OF: '#71717a',
  USES: '#2563eb',
  PREREQUISITE: '#16a34a',
  CONTRASTS: '#b45309',
  SEE_ALSO: '#8b5cf6',
};
