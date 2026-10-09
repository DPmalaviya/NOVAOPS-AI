// Shared types for NovaOps AI. No runtime logic except limits/config helpers.

export type SourceKind = 'upload' | 'github' | 'sample';
export type DocState = 'pending' | 'processing' | 'ready' | 'failed';

export interface DocumentRecord {
  id: string;
  filename: string;
  source: SourceKind;
  /** e.g. github:owner/repo:path@branch or upload session origin */
  sourceRef?: string;
  /** blob SHA (github) or content SHA-256 (upload) — identity for change detection */
  sourceVersion?: string;
  mime: string;
  sizeBytes: number;
  state: DocState;
  error?: string;
  chunkCount: number;
  contentHash: string;
  indexedAt?: string;
  createdAt: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  index: number;
  text: string;
  heading?: string;
  page?: number;
  startLine?: number;
  endLine?: number;
  contentHash: string;
}

export interface Evidence {
  chunkId: string;
  documentId: string;
  filename: string;
  text: string;
  score: number;
  heading?: string;
  page?: number;
  startLine?: number;
  endLine?: number;
  sourceRef?: string;
}

export interface Citation {
  marker: string; // e.g. S1
  chunkId: string;
  documentId: string;
  filename: string;
  heading?: string;
  page?: number;
  startLine?: number;
  endLine?: number;
}

export type ProviderName = 'gemini' | 'workers-ai' | 'ollama-cloud';
export type ErrorCategory =
  | 'timeout' | 'rate_limit' | 'quota' | 'auth' | 'invalid_model'
  | 'bad_response' | 'unavailable' | 'unknown';

export interface ProviderAttempt {
  provider: ProviderName;
  model: string;
  ok: boolean;
  latencyMs: number;
  errorCategory?: ErrorCategory;
  retryable?: boolean;
}

export interface ProviderResult {
  provider: ProviderName;
  model: string;
  text: string;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface QueryResponse {
  question: string;
  answer: string | null;
  /** true when generation was unavailable and evidence is returned on its own */
  retrievalOnly: boolean;
  /** true when retrieval found no evidence strong enough to answer from */
  insufficientEvidence: boolean;
  provider: ProviderName | null;
  model: string | null;
  citations: Citation[];
  citationsVerified: boolean;
  evidence: Evidence[];
  attempts: ProviderAttempt[];
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
  embedder: { provider: string; model: string; dimensions: number };
}

export interface SyncRun {
  id: string;
  repo: string;
  branch: string;
  startedAt: string;
  finishedAt?: string;
  added: number; updated: number; skipped: number; deleted: number; failed: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed';
}

export interface AppLimits {
  maxFileBytes: number;
  maxFilesPerSession: number;
  maxQueryChars: number;
  maxTopK: number;
  maxContextChars: number;
  queriesPerMinute: number;
}

export const DEFAULT_LIMITS: AppLimits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerSession: 5,
  maxQueryChars: 2000,
  maxTopK: 10,
  maxContextChars: 12000,
  queriesPerMinute: 60,
};

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'markdown', 'csv'] as const;

export function extensionOf(filename: string): string {
  const m = /\.([^.]+)$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : '';
}
export function isSupportedFile(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}
