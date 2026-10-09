// Embedding providers. An index records provider + model + dimensions and
// every query against it uses the same model (enforced by IngestionService
// storing the active embedder identity on each document's chunks).

export interface Embedder {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Local, offline, real neural embeddings: BGE-small via ONNX (Node only). */
export class TransformersEmbedder implements Embedder {
  readonly provider = 'transformers-local';
  readonly model: string;
  readonly dimensions = 384;
  private pipePromise: Promise<any> | null = null;
  constructor(model = 'Xenova/bge-small-en-v1.5') { this.model = model; }
  private async pipe(): Promise<any> {
    if (!this.pipePromise) {
      this.pipePromise = (async () => {
        const { pipeline } = await import('@huggingface/transformers');
        return pipeline('feature-extraction', this.model);
      })();
    }
    return this.pipePromise;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const ex = await this.pipe();
    const out: number[][] = [];
    const BATCH = 16;
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      // BGE models expect an instruction prefix on queries only; for a
      // symmetric document index we embed passages and queries the same
      // way, which BGE supports for short factual corpora.
      const res = await ex(batch, { pooling: 'mean', normalize: true });
      out.push(...(res.tolist() as number[][]));
    }
    return out;
  }
}

/** Cloudflare Workers AI embeddings (binding in a Worker, REST elsewhere). */
export class WorkersAIEmbedder implements Embedder {
  readonly provider = 'workers-ai';
  readonly dimensions: number;
  constructor(
    readonly model = '@cf/baai/bge-base-en-v1.5',
    private binding?: { run: (m: string, i: unknown) => Promise<any> },
    private rest?: { accountId: string; apiToken: string },
  ) { this.dimensions = model.includes('large') ? 1024 : model.includes('small') ? 384 : 768; }
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    const BATCH = 50;
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      let data: number[][] | undefined;
      if (this.binding) {
        const res = await this.binding.run(this.model, { text: batch });
        data = res?.data;
      } else if (this.rest) {
        const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.rest.accountId}/ai/run/${this.model}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.rest.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: batch }),
        });
        if (!r.ok) throw new Error(`Workers AI embeddings failed: HTTP ${r.status}`);
        const j: any = await r.json();
        data = j?.result?.data;
      } else throw new Error('WorkersAIEmbedder needs a binding or REST credentials');
      if (!Array.isArray(data)) throw new Error('Workers AI embeddings returned a malformed response');
      out.push(...data);
    }
    return out;
  }
}

/** Google Gemini embeddings via REST. */
export class GeminiEmbedder implements Embedder {
  readonly provider = 'gemini';
  readonly dimensions = 768;
  constructor(private apiKey: string, readonly model = 'gemini-embedding-001') {}
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: t }] }, outputDimensionality: this.dimensions }),
      });
      if (!r.ok) throw new Error(`Gemini embeddings failed: HTTP ${r.status}`);
      const j: any = await r.json();
      const v = j?.embedding?.values;
      if (!Array.isArray(v)) throw new Error('Gemini embeddings returned a malformed response');
      out.push(v);
    }
    return out;
  }
}

/**
 * Deterministic hashed bag-of-words embedder. TESTS AND OFFLINE BASELINE
 * ONLY — it captures lexical overlap, not learned semantics, and is never
 * presented as a neural model. It lets unit tests and the Python baseline
 * exercise the full pipeline with zero downloads.
 */
export class LexicalTestEmbedder implements Embedder {
  readonly provider = 'lexical-test';
  readonly model = 'hashed-bow-v1';
  readonly dimensions = 256;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      const tokens = t.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      for (const tok of tokens) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
        v[Math.abs(h) % this.dimensions] += 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

export function cosine(a: number[], b: number[]): number {
  let s = 0; let na = 0; let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : s / d;
}
