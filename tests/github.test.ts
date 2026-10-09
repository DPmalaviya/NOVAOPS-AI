import { describe, it, expect } from 'vitest';
import { MemoryStore, MemoryVectorStore, LexicalTestEmbedder, IngestionService, GitHubSyncService } from '@novaops/rag';

function mockGithub(files: Record<string, string>) {
  const state = { files: { ...files }, rawFetches: 0 };
  const shaOf = (path: string) => `sha-${state.files[path].length}-${state.files[path].slice(0, 4)}`;
  const fetchFn = async (url: string) => {
    const u = String(url);
    if (u.includes('/git/trees/')) {
      return { ok: true, json: async () => ({ tree: Object.keys(state.files).map((p) => ({ path: p, sha: shaOf(p), type: 'blob' })) }) } as any;
    }
    if (u.includes('raw.githubusercontent.com')) {
      state.rawFetches += 1;
      const path = decodeURIComponent(u.split('/main/')[1]);
      const content = state.files[path];
      if (content === undefined) return { ok: false, status: 404 } as any;
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(content).buffer } as any;
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { state, fetchFn: fetchFn as any };
}

describe('github sync', () => {
  it('indexes, skips unchanged, updates changed, removes deleted', async () => {
    const store = new MemoryStore(); const vectors = new MemoryVectorStore();
    const ingestion = new IngestionService(store, vectors, new LexicalTestEmbedder());
    const sync = new GitHubSyncService(store, ingestion);
    const gh = mockGithub({ 'docs/a.md': '# A\n\nAlpha content about retrieval pipelines and embeddings.', 'docs/b.md': '# B\n\nBeta content about provider routing and fallback order.' });
    const cfg = { owner: 'o', repo: 'r', branch: 'main', fetchFn: gh.fetchFn };

    const first = await sync.sync(cfg);
    expect(first.status).toBe('completed');
    expect(first.added).toBe(2);
    const rawAfterFirst = gh.state.rawFetches;

    const second = await sync.sync(cfg);
    expect(second.skipped).toBe(2);
    expect(second.added).toBe(0);
    expect(gh.state.rawFetches).toBe(rawAfterFirst); // no content re-fetched

    gh.state.files['docs/a.md'] = '# A\n\nAlpha content changed: now about chunking strategies and overlap.';
    const third = await sync.sync(cfg);
    expect(third.updated).toBe(1);
    expect(third.skipped).toBe(1);

    delete gh.state.files['docs/b.md'];
    const fourth = await sync.sync(cfg);
    expect(fourth.deleted).toBe(1);
    const docs = await store.listDocuments();
    expect(docs.map((d) => d.filename).sort()).toEqual(['a.md']);
  });
});
