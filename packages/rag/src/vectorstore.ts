// Vector storage behind an interface. Production: Cloudflare Vectorize.
// Local/tests: in-memory cosine search with identical semantics.
import type { Evidence } from '@novaops/shared';
import { cosine } from './embedder.js';

export interface StoredVector { id: string; values: number[]; chunkId: string; documentId: string; }
export interface VectorQueryHit { chunkId: string; documentId: string; score: number; }

export interface VectorStore {
  readonly kind: string;
  upsert(items: StoredVector[]): Promise<void>;
  query(vector: number[], topK: number): Promise<VectorQueryHit[]>;
  deleteByDocument(documentId: string): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export class MemoryVectorStore implements VectorStore {
  readonly kind = 'memory';
  private items = new Map<string, StoredVector>();
  async upsert(items: StoredVector[]): Promise<void> { for (const i of items) this.items.set(i.id, i); }
  async query(vector: number[], topK: number): Promise<VectorQueryHit[]> {
    return [...this.items.values()]
      .map((i) => ({ chunkId: i.chunkId, documentId: i.documentId, score: cosine(vector, i.values) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  async deleteByDocument(documentId: string): Promise<void> {
    for (const [k, v] of this.items) if (v.documentId === documentId) this.items.delete(k);
  }
  async count(): Promise<number> { return this.items.size; }
  async clear(): Promise<void> { this.items.clear(); }
}

/** Cloudflare Vectorize adapter (V2 index). Chunk/document ids ride in metadata. */
export class VectorizeStore implements VectorStore {
  readonly kind = 'vectorize';
  constructor(private index: any) {}
  async upsert(items: StoredVector[]): Promise<void> {
    const BATCH = 100;
    for (let i = 0; i < items.length; i += BATCH) {
      await this.index.upsert(items.slice(i, i + BATCH).map((v) => ({
        id: v.id, values: v.values, metadata: { chunkId: v.chunkId, documentId: v.documentId },
      })));
    }
  }
  async query(vector: number[], topK: number): Promise<VectorQueryHit[]> {
    const res = await this.index.query(vector, { topK, returnMetadata: 'all' });
    return (res.matches ?? []).map((m: any) => ({
      chunkId: m.metadata?.chunkId ?? m.id, documentId: m.metadata?.documentId ?? '', score: m.score,
    }));
  }
  async deleteByDocument(documentId: string): Promise<void> {
    // Vectorize deletes by id; ids are `${documentId}#${index}` with a known
    // chunk count kept in D1, so the caller passes ids through deleteByIds.
    throw new Error(`deleteByDocument needs explicit ids for Vectorize; use deleteByIds (document ${documentId})`);
  }
  async deleteByIds(ids: string[]): Promise<void> {
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) await this.index.deleteByIds(ids.slice(i, i + BATCH));
  }
  async count(): Promise<number> {
    const d = await this.index.describe();
    return d?.vectorCount ?? 0;
  }
  async clear(): Promise<void> { throw new Error('Vectorize clear is intentionally not implemented; delete documents individually'); }
}

export type { Evidence };
