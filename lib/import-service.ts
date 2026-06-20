// Typed boundary to the local Python import service (import-pipeline/).
// The URL helper is server-only (used by route handlers); the types are shared with the
// client import UI. Default assumes the service runs locally on port 8000.

const DEFAULT_IMPORT_SERVICE_URL = 'http://localhost:8000';

export function importServiceUrl(): string {
  return (process.env.IMPORT_SERVICE_URL || DEFAULT_IMPORT_SERVICE_URL).replace(/\/$/, '');
}

export type ImportJobState = 'queued' | 'running' | 'done' | 'failed';

export interface ImportJobProgress {
  stage?: string;
  entries?: number;
}

export interface ImportResult {
  collectionSlug: string;
  entries: number;
  relations: number;
}

export interface ImportJobStatus {
  id: string;
  kind: string;
  status: ImportJobState;
  progress?: ImportJobProgress | null;
  result?: ImportResult | null;
  error?: string | null;
}

export interface ImportJobCreated {
  jobId: string;
}
