import { describe, it, expect } from 'vitest';
import { ProviderRouter, ProviderError, type GenerationProvider } from '@novaops/rag';
import type { ProviderName } from '@novaops/shared';

function fake(name: ProviderName, behavior: 'ok' | 'rate' | 'auth' | 'flaky', model = 'm'): GenerationProvider & { calls: number } {
  const p = {
    name, model, calls: 0,
    async generate() {
      p.calls += 1;
      if (behavior === 'rate') throw new ProviderError('rate limited', 'rate_limit', true);
      if (behavior === 'auth') throw new ProviderError('bad key', 'auth', false);
      if (behavior === 'flaky' && p.calls === 1) throw new ProviderError('timeout', 'timeout', true);
      return { provider: name, model, text: `answer from ${name}`, latencyMs: 5 };
    },
  };
  return p as any;
}
const opts = { system: 's', user: 'u' };

describe('provider router', () => {
  it('uses the primary when it works', async () => {
    const a = fake('gemini', 'ok'); const b = fake('workers-ai', 'ok');
    const out = await new ProviderRouter([a, b]).generate(opts);
    expect(out.result?.provider).toBe('gemini');
    expect(b.calls).toBe(0);
  });
  it('falls back in order after bounded retries', async () => {
    const a = fake('gemini', 'rate'); const b = fake('workers-ai', 'ok');
    const out = await new ProviderRouter([a, b]).generate(opts);
    expect(out.result?.provider).toBe('workers-ai');
    expect(a.calls).toBe(2); // initial + one bounded retry
    expect(out.attempts.filter((x) => !x.ok)).toHaveLength(2);
  });
  it('does not retry permanent auth errors', async () => {
    const a = fake('gemini', 'auth'); const b = fake('workers-ai', 'ok');
    const out = await new ProviderRouter([a, b]).generate(opts);
    expect(a.calls).toBe(1);
    expect(out.result?.provider).toBe('workers-ai');
  });
  it('retries a flaky provider once and succeeds', async () => {
    const a = fake('gemini', 'flaky');
    const out = await new ProviderRouter([a]).generate(opts);
    expect(out.result?.provider).toBe('gemini');
    expect(a.calls).toBe(2);
  });
  it('returns null result when all providers fail (retrieval-only path)', async () => {
    const out = await new ProviderRouter([fake('gemini', 'rate'), fake('workers-ai', 'auth')]).generate(opts);
    expect(out.result).toBeNull();
    expect(out.attempts.length).toBeGreaterThan(0);
  });
});
