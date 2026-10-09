// Retrieval: embed the question with the index's model, vector search,
// then hydrate hits with chunk + document metadata from the store.
import type { Evidence } from '@novaops/shared';
import type { Embedder } from './embedder.js';
import type { VectorStore } from './vectorstore.js';
import type { MetadataStore } from './store.js';

export interface RetrievalResult { evidence: Evidence[]; retrievalMs: number; }

export class Retriever {
  constructor(
    private store: MetadataStore,
    private vectors: VectorStore,
    private embedder: Embedder,
  ) {}
  async retrieve(question: string, topK: number): Promise<RetrievalResult> {
    const t0 = Date.now();
    const [qv] = await this.embedder.embed([question]);
    const hits = await this.vectors.query(qv, topK);
    const chunks = await this.store.getChunks(hits.map((h) => h.chunkId));
    const byId = new Map(chunks.map((c) => [c.id, c]));
    const evidence: Evidence[] = [];
    for (const hit of hits) {
      const chunk = byId.get(hit.chunkId);
      if (!chunk) continue; // vector without metadata: skip rather than fabricate
      const doc = await this.store.getDocument(chunk.documentId);
      evidence.push({
        chunkId: chunk.id, documentId: chunk.documentId, filename: doc?.filename ?? '(unknown document)',
        text: chunk.text, score: hit.score, heading: chunk.heading, page: chunk.page,
        startLine: chunk.startLine, endLine: chunk.endLine, sourceRef: doc?.sourceRef,
      });
    }
    return { evidence, retrievalMs: Date.now() - t0 };
  }
}
