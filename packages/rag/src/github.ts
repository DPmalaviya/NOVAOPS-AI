// Public GitHub repository sync. Identity = blob SHA from the Git Trees
// API; content is only fetched for files whose SHA changed, unchanged
// files are skipped without re-embedding, and files that disappear from
// the tree are removed from the index. Fully idempotent.
import { isSupportedFile, type SyncRun } from '@novaops/shared';
import type { IngestionService } from './ingest.js';
import { newId } from './ingest.js';
import type { MetadataStore } from './store.js';

export interface GitHubSyncConfig {
  owner: string; repo: string; branch?: string; pathPrefix?: string;
  token?: string; fetchFn?: typeof fetch;
}
export interface TreeEntry { path: string; sha: string; size?: number; type: string; }

export class GitHubSyncService {
  constructor(private store: MetadataStore, private ingestion: IngestionService) {}

  async sync(cfg: GitHubSyncConfig): Promise<SyncRun> {
    const fetchFn = cfg.fetchFn ?? fetch;
    const branch = cfg.branch ?? 'main';
    const repoSlug = `${cfg.owner}/${cfg.repo}`;
    const run: SyncRun = { id: newId('sync'), repo: repoSlug, branch, startedAt: new Date().toISOString(),
      added: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, errors: [], status: 'running' };
    await this.store.putSyncRun(run);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'NovaOps-AI' };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    try {
      const treeRes = await fetchFn(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
      if (!treeRes.ok) throw new Error(`GitHub tree request failed: HTTP ${treeRes.status}`);
      const treeJson: any = await treeRes.json();
      const entries: TreeEntry[] = (treeJson.tree ?? []).filter((e: any) => e.type === 'blob');
      const prefix = cfg.pathPrefix?.replace(/^\/+|\/+$/g, '');
      const wanted = entries.filter((e) => isSupportedFile(e.path) && (!prefix || e.path.startsWith(`${prefix}/`) || e.path === prefix));
      const seenRefs = new Set<string>();
      for (const entry of wanted) {
        const sourceRef = `github:${repoSlug}:${entry.path}@${branch}`;
        seenRefs.add(sourceRef);
        const existing = await this.store.findDocumentBySourceRef(sourceRef);
        if (existing && existing.sourceVersion === entry.sha && existing.state === 'ready') { run.skipped += 1; continue; }
        try {
          const raw = await fetchFn(`https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${encodeURIComponent(branch)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`, { headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {} });
          if (!raw.ok) throw new Error(`raw fetch HTTP ${raw.status}`);
          const bytes = new Uint8Array(await raw.arrayBuffer());
          const filename = entry.path.split('/').pop() ?? entry.path;
          const res = await this.ingestion.ingest({ filename, bytes, source: 'github', sourceRef, sourceVersion: entry.sha });
          if (res.skipped) run.skipped += 1; else if (existing) run.updated += 1; else run.added += 1;
        } catch (err) {
          run.failed += 1;
          run.errors.push(`${entry.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      // Deletions: documents from this repo+branch no longer in the tree.
      const allDocs = await this.store.listDocuments();
      for (const doc of allDocs) {
        if (doc.source === 'github' && doc.sourceRef?.startsWith(`github:${repoSlug}:`) && doc.sourceRef.endsWith(`@${branch}`) && !seenRefs.has(doc.sourceRef)) {
          await this.ingestion.deleteDocument(doc.id);
          run.deleted += 1;
        }
      }
      run.status = 'completed';
    } catch (err) {
      run.status = 'failed';
      run.errors.push(err instanceof Error ? err.message : String(err));
    }
    run.finishedAt = new Date().toISOString();
    await this.store.putSyncRun(run);
    return run;
  }
}
