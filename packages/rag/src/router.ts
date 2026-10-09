// Provider router: ordered fallback with bounded retries.
// Retries only retryable categories (timeout, rate limit, 5xx, malformed)
// once per provider with backoff. Auth / invalid-model / quota errors move
// straight to the next provider. If every provider fails, the caller
// returns retrieval-only evidence instead of an error.
import type { ProviderAttempt, ProviderResult } from '@novaops/shared';
import { ProviderError, type GenerationProvider, type GenerateOptions } from './providers.js';

export interface RouterOutcome {
  result: ProviderResult | null;
  attempts: ProviderAttempt[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ProviderRouter {
  constructor(private providers: GenerationProvider[], private maxRetriesPerProvider = 1) {}
  get configured(): string[] { return this.providers.map((p) => `${p.name}:${p.model}`); }
  async generate(opts: GenerateOptions): Promise<RouterOutcome> {
    const attempts: ProviderAttempt[] = [];
    for (const provider of this.providers) {
      for (let tryIdx = 0; tryIdx <= this.maxRetriesPerProvider; tryIdx++) {
        const t0 = Date.now();
        try {
          const result = await provider.generate(opts);
          attempts.push({ provider: provider.name, model: provider.model, ok: true, latencyMs: result.latencyMs });
          return { result, attempts };
        } catch (err) {
          const pe = err instanceof ProviderError ? err : new ProviderError(String(err), 'unknown', false);
          attempts.push({ provider: provider.name, model: provider.model, ok: false, latencyMs: Date.now() - t0, errorCategory: pe.category, retryable: pe.retryable });
          if (!pe.retryable || tryIdx === this.maxRetriesPerProvider) break;
          await sleep(250 * (tryIdx + 1));
        }
      }
    }
    return { result: null, attempts };
  }
}
