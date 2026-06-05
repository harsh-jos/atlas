import type { RelationType } from '@prisma/client';

export interface SuggestedRelation {
  candidateId: string;
  candidateTitle: string;
  relationType: RelationType;
  note: string;
  rationale: string;
  approved: boolean;
}

export interface IngestionPreview {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  metadata: Record<string, unknown>;
  suggestedRelations: SuggestedRelation[];
}

export type IngestionStage = 'select' | 'processing' | 'preview' | 'error';
