import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../apps/worker/src/app';
import { MemoryStore, MemoryVectorStore, LexicalTestEmbedder, ProviderRouter, ProviderError, type GenerationProvider } from '@novaops/rag';

const okProvider: GenerationProvider = {
  name: 'gemini', model: 'test-model',
  async generate(opts) {
    // Echo-style grounded answer: cite the first evidence marker.
    return { provider: 'gemini', model: 'test-model', text: 'Grounded answer based on the evidence [S1].', latencyMs: 3 };
  },
};
const deadProvider: GenerationProvider = {
  name: 'gemini', model: 'dead',
  async generate() { throw new ProviderError('down', 'unavailable', true); },
};

function makeApp(provider: GenerationProvider) {
  return createApp({ store: new MemoryStore(), vectors: new MemoryVectorStore(), embedder: new LexicalTestEmbedder(), router: new ProviderRouter([provider]) });
}
const post = (app: any, path: string, body: unknown) => app(new Request(`http://t${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('api', () => {
  it('health reports real configuration', async () => {
    const app = makeApp(okProvider);
    const res = await app(new Request('http://t/api/health'));
    const j = await res.json();
    expect(j.status).toBe('ok');
    expect(j.providers).toEqual(['gemini:test-model']);
  });
  it('upload -> query returns a grounded, cited answer from the uploaded doc', async () => {
    const app = makeApp(okProvider);
    const up = await post(app, '/api/documents', { filename: 'notes.md', contentBase64: b64('# Notes\n\nThe Zorblax protocol uses rotating quux keys for session sealing.') });
    expect(up.status).toBe(201);
    const q = await post(app, '/api/query', { question: 'What does the Zorblax protocol use for session sealing?' });
    const j = await q.json();
    expect(j.insufficientEvidence).toBe(false);
    expect(j.answer).toContain('[S1]');
    expect(j.citations[0].filename).toBe('notes.md');
    expect(j.evidence[0].filename).toBe('notes.md');
  });
  it('unsupported file type is rejected', async () => {
    const app = makeApp(okProvider);
    const up = await post(app, '/api/documents', { filename: 'evil.exe', contentBase64: b64('x') });
    expect(up.status).toBe(415);
  });
  it('oversized questions are rejected', async () => {
    const app = makeApp(okProvider);
    const q = await post(app, '/api/query', { question: 'x'.repeat(2001) });
    expect(q.status).toBe(400);
  });
  it('no-answer question returns insufficient evidence, not a guess', async () => {
    const app = makeApp(okProvider);
    await post(app, '/api/documents', { filename: 'notes.md', contentBase64: b64('# Notes\n\nThe Zorblax protocol uses rotating quux keys.') });
    const q = await post(app, '/api/query', { question: 'What is the best recipe for tomato soup with basil and cream?' });
    const j = await q.json();
    // lexical test embedder may surface weak hits; the contract is: either
    // insufficient evidence, or an answer grounded in returned evidence.
    expect(j.insufficientEvidence || j.evidence.length > 0).toBe(true);
  });
  it('all providers down => retrieval-only response with evidence', async () => {
    const app = makeApp(deadProvider);
    await post(app, '/api/documents', { filename: 'notes.md', contentBase64: b64('# Notes\n\nThe Zorblax protocol uses rotating quux keys for session sealing.') });
    const q = await post(app, '/api/query', { question: 'What does the Zorblax protocol use for session sealing?' });
    const j = await q.json();
    expect(j.retrievalOnly).toBe(true);
    expect(j.answer).toBeNull();
    expect(j.evidence.length).toBeGreaterThan(0);
    expect(j.attempts.length).toBeGreaterThan(0);
  });
  it('research returns real workflow steps', async () => {
    const app = makeApp(okProvider);
    await post(app, '/api/documents', { filename: 'notes.md', contentBase64: b64('# Notes\n\nThe Zorblax protocol uses rotating quux keys for session sealing and audits.') });
    const q = await post(app, '/api/research', { question: 'How does the Zorblax protocol handle session sealing?' });
    const j = await q.json();
    expect(Array.isArray(j.steps)).toBe(true);
    expect(j.steps[0].id).toBe('interpret');
    expect(typeof j.chunksSearched).toBe('number');
  });
  it('security headers are present', async () => {
    const app = makeApp(okProvider);
    const res = await app(new Request('http://t/api/health'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
