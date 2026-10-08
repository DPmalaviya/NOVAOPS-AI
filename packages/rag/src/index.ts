/** Explicit RAG contracts. Implementations are deliberately added stage by stage. */
import type { EvidenceChunk } from '@novaops/shared'
export type ChunkingConfig = { strategy: 'recursive' | 'structure-aware'; targetTokens: number; overlapTokens: number }
export interface Embedder { readonly provider: string; readonly model: string; readonly dimensions: number; embed(texts: string[]): Promise<number[][]> }
export interface VectorStore { upsert(vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>): Promise<void>; query(vector: number[], topK: number): Promise<EvidenceChunk[]>; remove(ids: string[]): Promise<void> }
export interface Retriever { retrieve(question: string, topK: number): Promise<EvidenceChunk[]> }
export { chunkText, type Chunk, type ChunkSource } from './chunker'
