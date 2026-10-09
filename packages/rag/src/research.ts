// Research mode: a deterministic state machine, not a swarm of agents.
// States are recorded from real operations (chunks searched = vectors in
// the store, evidence retained = deduped hits above threshold), so the UI
// never displays invented progress.
import type { Evidence, QueryResponse } from '@novaops/shared';
import { Retriever } from './retriever.js';
import { ProviderRouter } from './router.js';
import { buildResearchPrompt } from './prompt.js';
import { extractCitations, stripUnverifiedMarkers } from './citations.js';
import type { Embedder } from './embedder.js';
import type { MetadataStore } from './store.js';
import type { VectorStore } from './vectorstore.js';
import { newId } from './ingest.js';

export interface ResearchStep { id: string; label: string; detail: string; status: 'done' | 'failed'; }
export interface ResearchResponse extends QueryResponse { steps: ResearchStep[]; chunksSearched: number; }

/** Deterministic query expansion: the question plus its longest noun-ish phrases. */
export function expandQuery(question: string): string[] {
  const out = [question];
  const cleaned = question.replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  if (words.length > 6) out.push(words.slice(0, 6).join(' '));
  const caps = cleaned.match(/\b[A-Z][a-zA-Z0-9-]{2,}(?:\s[A-Z][a-zA-Z0-9-]{2,})?\b/g);
  if (caps) for (const c of caps.slice(0, 2)) if (!out.includes(c)) out.push(`${c} ${words.slice(0, 3).join(' ')}`);
  return out.slice(0, 3);
}

export class ResearchService {
  constructor(
    private retriever: Retriever,
    private router: ProviderRouter,
    private embedder: Embedder,
    private store: MetadataStore,
    private vectors: VectorStore,
    private minTopScore = 0.50,
  ) {}

  async research(question: string): Promise<ResearchResponse> {
    const t0 = Date.now();
    const steps: ResearchStep[] = [];
    const queries = expandQuery(question);
    steps.push({ id: 'interpret', label: 'Question interpreted', detail: `${queries.length} retrieval quer${queries.length === 1 ? 'y' : 'ies'} derived`, status: 'done' });
    const chunksSearched = await this.vectors.count();
    const seen = new Map<string, Evidence>();
    let retrievalMs = 0;
    for (const q of queries) {
      const r = await this.retriever.retrieve(q, 8);
      retrievalMs += r.retrievalMs;
      for (const e of r.evidence) if (!seen.has(e.chunkId) || (seen.get(e.chunkId)?.score ?? 0) < e.score) seen.set(e.chunkId, e);
    }
    const all = [...seen.values()].sort((a, b) => b.score - a.score);
    steps.push({ id: 'retrieve', label: 'Evidence retrieved', detail: `${chunksSearched} chunks searched, ${all.length} unique candidates`, status: 'done' });
    const selected = all.filter((e) => e.score >= this.minTopScore).slice(0, 8);
    steps.push({ id: 'select', label: 'Evidence selected', detail: `${selected.length} chunks above the confidence threshold`, status: 'done' });
    const emb = { provider: this.embedder.provider, model: this.embedder.model, dimensions: this.embedder.dimensions };
    if (!selected.length) {
      steps.push({ id: 'generate', label: 'Brief generation', detail: 'Skipped: insufficient evidence', status: 'failed' });
      await this.store.logQuery({ id: newId('q'), question, provider: null, retrievalMs, generationMs: 0, totalMs: Date.now() - t0, insufficientEvidence: true, createdAt: new Date().toISOString() });
      return { question, answer: null, retrievalOnly: false, insufficientEvidence: true, provider: null, model: null,
        citations: [], citationsVerified: false, evidence: all, attempts: [],
        timings: { retrievalMs, generationMs: 0, totalMs: Date.now() - t0 }, embedder: emb, steps, chunksSearched };
    }
    const prompt = buildResearchPrompt(question, selected);
    const tg = Date.now();
    const { result, attempts } = await this.router.generate({ system: prompt.system, user: prompt.user, maxTokens: 1600 });
    const generationMs = Date.now() - tg;
    for (const a of attempts) await this.store.logProviderAttempt({ ...a, at: new Date().toISOString() });
    if (!result) {
      steps.push({ id: 'generate', label: 'Brief generation', detail: 'All generation providers failed; returning evidence only', status: 'failed' });
      steps.push({ id: 'verify', label: 'Citations verified', detail: 'No generated text to verify', status: 'failed' });
      return { question, answer: null, retrievalOnly: true, insufficientEvidence: false, provider: null, model: null,
        citations: [], citationsVerified: false, evidence: selected, attempts,
        timings: { retrievalMs, generationMs, totalMs: Date.now() - t0 }, embedder: emb, steps, chunksSearched };
    }
    steps.push({ id: 'generate', label: 'Brief generated', detail: `${result.provider} · ${result.model}`, status: 'done' });
    const clean = stripUnverifiedMarkers(result.text, selected.length);
    const citations = extractCitations(clean, selected);
    steps.push({ id: 'verify', label: 'Citations verified', detail: `${citations.length} citation markers mapped to real chunks`, status: 'done' });
    await this.store.logQuery({ id: newId('q'), question, provider: result.provider, retrievalMs, generationMs, totalMs: Date.now() - t0, insufficientEvidence: false, createdAt: new Date().toISOString() });
    return { question, answer: clean, retrievalOnly: false, insufficientEvidence: false, provider: result.provider, model: result.model,
      citations, citationsVerified: citations.length > 0, evidence: selected, attempts,
      timings: { retrievalMs, generationMs, totalMs: Date.now() - t0 }, embedder: emb, steps, chunksSearched };
  }
}
