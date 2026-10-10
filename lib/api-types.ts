/** Wire shapes returned by the Python API. Mirrors app/api/library.py. */

export type RelationType = 'PART_OF' | 'USES' | 'PREREQUISITE' | 'CONTRASTS' | 'SEE_ALSO';
export type SourceType = 'BOOK' | 'PAPER' | 'DOCS' | 'TUTORIAL' | 'COURSE' | 'WEBSITE';
export type ArtifactFormat = 'MD' | 'HTML' | 'PDF';
export type Origin = 'HUMAN' | 'AI';

export interface ConceptSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  artifactCount: number;
  recentArtifactTitle: string | null;
}

export interface ConceptDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  overview: string | null;
  artifactCount: number;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  sourceCount: number;
  updatedAt: string;
}

export interface ConceptPage {
  concept: ConceptDetail;
  artifacts: ArtifactSummary[];
  tags: string[];
  totalTags: number;
  matched: number;
  page: number;
  pageSize: number;
}

export interface Source {
  sourceType: SourceType;
  title: string;
  author: string | null;
  url: string | null;
  ref: string | null;
}

export interface Relation {
  relationType: RelationType;
  note: string | null;
  origin: Origin;
  artifact: { title: string; slug: string };
  concept: { name: string; color: string | null };
}

export interface ArtifactDetail {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string | null;
  bodyHtml: string | null;
  format: ArtifactFormat;
  tags: string[];
  metadata: Record<string, unknown> | null;
  origin: Origin;
  createdAt: string;
  updatedAt: string;
  concept: ConceptDetail;
  sources: Source[];
  relationsFrom: Relation[];
  relationsTo: Relation[];
}

export interface SearchHit {
  slug: string;
  title: string;
  summary: string | null;
  concept: string;
  conceptColor: string | null;
  tags: string[];
  sourceCount: number;
  updatedAt: string;
  excerpt: string | null;
}

export interface GraphNode {
  nodeKind: 'concept' | 'explanation';
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  conceptName: string;
  conceptColor: string;
}

export interface GraphLink {
  source: string;
  target: string;
  relationType: RelationType | 'requires' | 'related_to' | 'explains';
  note: string | null;
  origin: Origin;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface ChatMessage {
  role: 'you' | 'atlas';
  text: string;
}

export interface ChatHistory {
  sessionId: string;
  messages: ChatMessage[];
  latestTurn: ChatTurn | null;
}

export interface ChatTurn {
  id: string;
  requestId: string;
  sessionId: string;
  message: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  reply: string | null;
  error: string | null;
  toolName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  sessionId: string;
  firstMessage: string | null;
  updatedAt: string;
}
