export const APP_VERSION = '0.1.0'
export type HealthResponse = { status: 'ok'; service: 'novaops-worker'; version: string; timestamp: string }
export type ApiError = { code: string; message: string; requestId?: string }
export type SourceType = 'upload' | 'github' | 'sample'
export type DocumentStatus = 'queued' | 'parsing' | 'indexing' | 'ready' | 'failed' | 'deleting'
export type DocumentRecord = { id: string; filename: string; sourceType: SourceType; sourceUri?: string; bytes: number; contentHash: string; status: DocumentStatus; chunkCount?: number; indexedAt?: string; errorReason?: string }
export type EvidenceChunk = { id: string; documentId: string; chunkIndex: number; text: string; metadata: { page?: number; heading?: string; lineStart?: number; lineEnd?: number; rowStart?: number; rowEnd?: number; sourceUri?: string }; score?: number }
export type ProviderResult = { provider: 'gemini' | 'workers-ai' | 'ollama-cloud'; model: string; response: string; latencyMs: number; inputTokens?: number; outputTokens?: number; retryable: boolean }
