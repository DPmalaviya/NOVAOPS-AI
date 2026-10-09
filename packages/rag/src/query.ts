// The RAG query service: validate -> retrieve -> threshold -> prompt ->
// route providers -> verify citations -> respond (or retrieval-only).
import type { QueryResponse } from '@novaops/shared';
import { Retriever } from './retriever.js';
import { buildPrompt, buildResearchPrompt } from './prompt.js';
import { ProviderRouter } from './router.js';
import { extractCitations, stripUnverifiedMarkers } from './citations.js';
import type { Embedder } from './embedder.js';
import type { MetadataStore } from './store.js';
import { newId } from './ingest.js';

export interface QueryServiceConfig {
  /** Minimum cosine score for the top hit to attempt generation. */
  minTopScore: number;
  maxContextChars: number;
}

export const DEFAULT_QUERY_CONFIG: QueryServiceConfig = { minTopScore: 0.50, maxContextChars: 12000 };

export class QueryService {
  constructor(
    private retriever: Retriever,
    private router: ProviderRouter,
    private embedder: Embedder,
    private store: MetadataStore,
    private config: QueryServiceConfig = DEFAULT_QUERY_CONFIG,
  ) {}

  async query(question: string, topK = 5): Promise<QueryResponse> {
    return this.run(question, topK, false);
  }
  async research(question: string, topK = 8): Promise<QueryResponse> {
    return this.run(question, topK, true);
  }

  private async run(question: string, topK: number, research: boolean): Promise<QueryResponse> {
    const t0 = Date.now();
    const { evidence, retrievalMs } = await this.retriever.retrieve(question, topK);
    const emb = { provider: this.embedder.provider, model: this.embedder.model, dimensions: this.embedder.dimensions };
    const topScore = evidence[0]?.score ?? 0;
    if (!evidence.length || topScore < this.config.minTopScore) {
      const totalMs = Date.now() - t0;
      await this.store.logQuery({ id: newId('q'), question, provider: null, retrievalMs, generationMs: 0, totalMs, insufficientEvidence: true, createdAt: new Date().toISOString() });
      return {
        question, answer: null, retrievalOnly: false, insufficientEvidence: true,
        provider: null, model: null, citations: [], citationsVerified: false,
        evidence, attempts: [], timings: { retrievalMs, generationMs: 0, totalMs }, embedder: emb,
      };
    }
    const prompt = research
      ? buildResearchPrompt(question, evidence, this.config.maxContextChars)
      : buildPrompt(question, evidence, this.config.maxContextChars);
    const tg = Date.now();
    const { result, attempts } = await this.router.generate({ system: prompt.system, user: prompt.user });
    const generationMs = Date.now() - tg;
    for (const a of attempts) await this.store.logProviderAttempt({ ...a, at: new Date().toISOString() });
    const totalMs = Date.now() - t0;
    await this.store.logQuery({ id: newId('q'), question, provider: result?.provider ?? null, retrievalMs, generationMs, totalMs, insufficientEvidence: false, createdAt: new Date().toISOString() });
    if (!result) {
      // Final fallback: retrieval remains useful without generation.
      return {
        question, answer: null, retrievalOnly: true, insufficientEvidence: false,
        provider: null, model: null, citations: [], citationsVerified: false,
        evidence, attempts, timings: { retrievalMs, generationMs, totalMs }, embedder: emb,
      };
    }
    const clean = stripUnverifiedMarkers(result.text, evidence.length);
    const citations = extractCitations(clean, evidence);
    return {
      question, answer: clean, retrievalOnly: false, insufficientEvidence: false,
      provider: result.provider, model: result.model,
      citations, citationsVerified: citations.length > 0,
      evidence, attempts, timings: { retrievalMs, generationMs, totalMs }, embedder: emb,
    };
  }
}
