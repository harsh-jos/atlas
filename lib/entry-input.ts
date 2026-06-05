import { EntryStatus, RelationType, SourceType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export interface EntryWritePayload {
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  tags?: unknown;
  status?: unknown;
  collectionId?: unknown;
  metadata?: unknown;
  sources?: unknown;
  relations?: unknown;
}

export interface SourceInput {
  sourceType: SourceType;
  title: string;
  author?: string;
  url?: string;
  ref?: string;
}

export interface RelationInput {
  toId: string;
  relationType: RelationType;
  note?: string;
}

export function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readEntryStatus(value: unknown) {
  return value === EntryStatus.PUBLISHED ? EntryStatus.PUBLISHED : EntryStatus.DRAFT;
}

export function readMetadata(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function readSources(value: unknown): SourceInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): SourceInput | null => {
      if (!isRecord(item)) {
        return null;
      }

      const title = readString(item.title)?.trim();
      const sourceType = readSourceType(item.sourceType);

      if (!title || !sourceType) {
        return null;
      }

      return {
        sourceType,
        title,
        author: blankToUndefined(readString(item.author)),
        url: blankToUndefined(readString(item.url)),
        ref: blankToUndefined(readString(item.ref)),
      };
    })
    .filter((source): source is SourceInput => source !== null);
}

export function readRelations(value: unknown, entryId: string): RelationInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RelationInput | null => {
      if (!isRecord(item)) {
        return null;
      }

      const toId = readString(item.toId)?.trim();
      const relationType = readRelationType(item.relationType);

      if (!toId || toId === entryId || !relationType) {
        return null;
      }

      return {
        toId,
        relationType,
        note: blankToUndefined(readString(item.note)),
      };
    })
    .filter((relation): relation is RelationInput => relation !== null);
}

export function dedupeRelations(relations: RelationInput[]) {
  const seen = new Set<string>();

  return relations.filter((relation) => {
    const key = `${relation.toId}:${relation.relationType}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildRelationRows(entryId: string, relations: RelationInput[]) {
  return relations.flatMap((relation) => {
    const outgoingRelation = {
      fromId: entryId,
      toId: relation.toId,
      relationType: relation.relationType,
      note: relation.note,
    };

    if (relation.relationType !== RelationType.SEE_ALSO) {
      return [outgoingRelation];
    }

    return [
      outgoingRelation,
      {
        fromId: relation.toId,
        toId: entryId,
        relationType: relation.relationType,
        note: relation.note,
      },
    ];
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSourceType(value: unknown) {
  return Object.values(SourceType).find((sourceType) => sourceType === value);
}

function readRelationType(value: unknown) {
  return Object.values(RelationType).find((relationType) => relationType === value);
}

function blankToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
