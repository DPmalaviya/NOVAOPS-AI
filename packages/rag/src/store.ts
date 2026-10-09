// Metadata storage. Production: Cloudflare D1. Local/tests: in-memory.
import type { ChunkRecord, DocumentRecord, ProviderAttempt, SyncRun } from '@novaops/shared';

export interface QueryLogEntry {
  id: string; question: string; provider: string | null; retrievalMs: number;
  generationMs: number; totalMs: number; insufficientEvidence: boolean; createdAt: string;
}

export interface MetadataStore {
  readonly kind: string;
  putDocument(doc: DocumentRecord): Promise<void>;
  getDocument(id: string): Promise<DocumentRecord | undefined>;
  listDocuments(): Promise<DocumentRecord[]>;
  deleteDocument(id: string): Promise<void>;
  putChunks(chunks: ChunkRecord[]): Promise<void>;
  getChunk(id: string): Promise<ChunkRecord | undefined>;
  getChunks(ids: string[]): Promise<ChunkRecord[]>;
  chunksForDocument(documentId: string): Promise<ChunkRecord[]>;
  deleteChunksForDocument(documentId: string): Promise<void>;
  findDocumentBySourceRef(sourceRef: string): Promise<DocumentRecord | undefined>;
  putSyncRun(run: SyncRun): Promise<void>;
  listSyncRuns(limit?: number): Promise<SyncRun[]>;
  logProviderAttempt(a: ProviderAttempt & { at: string }): Promise<void>;
  recentProviderAttempts(limit?: number): Promise<(ProviderAttempt & { at: string })[]>;
  logQuery(q: QueryLogEntry): Promise<void>;
  recentQueries(limit?: number): Promise<QueryLogEntry[]>;
  putEvalSummary(s: unknown): Promise<void>;
  getEvalSummary(): Promise<unknown>;
}

export class MemoryStore implements MetadataStore {
  readonly kind = 'memory';
  private docs = new Map<string, DocumentRecord>();
  private chunks = new Map<string, ChunkRecord>();
  private syncRuns: SyncRun[] = [];
  private attempts: (ProviderAttempt & { at: string })[] = [];
  private queries: QueryLogEntry[] = [];
  private evalSummary: unknown = null;
  async putDocument(d: DocumentRecord) { this.docs.set(d.id, d); }
  async getDocument(id: string) { return this.docs.get(id); }
  async listDocuments() { return [...this.docs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async deleteDocument(id: string) { this.docs.delete(id); }
  async putChunks(cs: ChunkRecord[]) { for (const c of cs) this.chunks.set(c.id, c); }
  async getChunk(id: string) { return this.chunks.get(id); }
  async getChunks(ids: string[]) { return ids.map((i) => this.chunks.get(i)).filter((c): c is ChunkRecord => !!c); }
  async chunksForDocument(documentId: string) { return [...this.chunks.values()].filter((c) => c.documentId === documentId).sort((a, b) => a.index - b.index); }
  async deleteChunksForDocument(documentId: string) { for (const [k, v] of this.chunks) if (v.documentId === documentId) this.chunks.delete(k); }
  async findDocumentBySourceRef(ref: string) { return [...this.docs.values()].find((d) => d.sourceRef === ref); }
  async putSyncRun(r: SyncRun) { this.syncRuns.unshift(r); this.syncRuns = this.syncRuns.slice(0, 100); }
  async listSyncRuns(limit = 20) { return this.syncRuns.slice(0, limit); }
  async logProviderAttempt(a: ProviderAttempt & { at: string }) { this.attempts.unshift(a); this.attempts = this.attempts.slice(0, 200); }
  async recentProviderAttempts(limit = 20) { return this.attempts.slice(0, limit); }
  async logQuery(q: QueryLogEntry) { this.queries.unshift(q); this.queries = this.queries.slice(0, 500); }
  async recentQueries(limit = 50) { return this.queries.slice(0, limit); }
  async putEvalSummary(s: unknown) { this.evalSummary = s; }
  async getEvalSummary() { return this.evalSummary; }
}

export const D1_SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT,
  source_version TEXT, mime TEXT, size_bytes INTEGER, state TEXT, error TEXT,
  chunk_count INTEGER DEFAULT 0, content_hash TEXT, indexed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_source_ref ON documents(source_ref);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, idx INTEGER NOT NULL, text TEXT NOT NULL,
  heading TEXT, page INTEGER, start_line INTEGER, end_line INTEGER, content_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY, repo TEXT, branch TEXT, started_at TEXT, finished_at TEXT,
  added INTEGER, updated INTEGER, skipped INTEGER, deleted INTEGER, failed INTEGER,
  errors TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS provider_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT, model TEXT, ok INTEGER,
  latency_ms INTEGER, error_category TEXT, at TEXT
);
CREATE TABLE IF NOT EXISTS query_log (
  id TEXT PRIMARY KEY, question TEXT, provider TEXT, retrieval_ms INTEGER,
  generation_ms INTEGER, total_ms INTEGER, insufficient INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT);
`;

/** Columns each table must have; used to self-heal pre-existing tables created
 * by older/partial schemas (CREATE TABLE IF NOT EXISTS alone does not add
 * missing columns, which otherwise breaks every insert in production). */
const EXPECTED_COLUMNS: Record<string, Record<string, string>> = {
  documents: { filename: 'TEXT', source: 'TEXT', source_ref: 'TEXT', source_version: 'TEXT', mime: 'TEXT', size_bytes: 'INTEGER', state: 'TEXT', error: 'TEXT', chunk_count: 'INTEGER', content_hash: 'TEXT', indexed_at: 'TEXT', created_at: 'TEXT' },
  chunks: { document_id: 'TEXT', idx: 'INTEGER', text: 'TEXT', heading: 'TEXT', page: 'INTEGER', start_line: 'INTEGER', end_line: 'INTEGER', content_hash: 'TEXT' },
  sync_runs: { repo: 'TEXT', branch: 'TEXT', started_at: 'TEXT', finished_at: 'TEXT', added: 'INTEGER', updated: 'INTEGER', skipped: 'INTEGER', deleted: 'INTEGER', failed: 'INTEGER', errors: 'TEXT', status: 'TEXT' },
  provider_attempts: { provider: 'TEXT', model: 'TEXT', ok: 'INTEGER', latency_ms: 'INTEGER', error_category: 'TEXT', at: 'TEXT' },
  query_log: { question: 'TEXT', provider: 'TEXT', retrieval_ms: 'INTEGER', generation_ms: 'INTEGER', total_ms: 'INTEGER', insufficient: 'INTEGER', created_at: 'TEXT' },
  kv_store: { value: 'TEXT' },
};

export class D1Store implements MetadataStore {
  readonly kind = 'd1';
  constructor(private db: any) {}
  async init(): Promise<void> {
    for (const stmt of D1_SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await this.db.prepare(stmt).run();
    // Self-heal: add any columns missing from pre-existing tables.
    for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
      const { results } = await this.db.prepare(`PRAGMA table_info(${table})`).all();
      const existing = new Set((results ?? []).map((r: any) => r.name));
      if (existing.size === 0) continue;
      for (const [col, type] of Object.entries(cols)) {
        if (!existing.has(col)) await this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
      }
    }
  }
  private rowToDoc(r: any): DocumentRecord {
    return {
      id: r.id, filename: r.filename, source: r.source, sourceRef: r.source_ref ?? undefined,
      sourceVersion: r.source_version ?? undefined, mime: r.mime ?? '', sizeBytes: r.size_bytes ?? 0,
      state: r.state, error: r.error ?? undefined, chunkCount: r.chunk_count ?? 0,
      contentHash: r.content_hash ?? '', indexedAt: r.indexed_at ?? undefined, createdAt: r.created_at,
    };
  }
  private rowToChunk(r: any): ChunkRecord {
    return {
      id: r.id, documentId: r.document_id, index: r.idx, text: r.text, heading: r.heading ?? undefined,
      page: r.page ?? undefined, startLine: r.start_line ?? undefined, endLine: r.end_line ?? undefined,
      contentHash: r.content_hash ?? '',
    };
  }
  async putDocument(d: DocumentRecord) {
    await this.db.prepare(`INSERT INTO documents (id,filename,source,source_ref,source_version,mime,size_bytes,state,error,chunk_count,content_hash,indexed_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename,source_version=excluded.source_version,state=excluded.state,error=excluded.error,chunk_count=excluded.chunk_count,content_hash=excluded.content_hash,indexed_at=excluded.indexed_at`)
      .bind(d.id, d.filename, d.source, d.sourceRef ?? null, d.sourceVersion ?? null, d.mime, d.sizeBytes, d.state, d.error ?? null, d.chunkCount, d.contentHash, d.indexedAt ?? null, d.createdAt).run();
  }
  async getDocument(id: string) { const r = await this.db.prepare('SELECT * FROM documents WHERE id=?').bind(id).first(); return r ? this.rowToDoc(r) : undefined; }
  async listDocuments() { const { results } = await this.db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all(); return (results ?? []).map((r: any) => this.rowToDoc(r)); }
  async deleteDocument(id: string) { await this.db.prepare('DELETE FROM documents WHERE id=?').bind(id).run(); }
  async putChunks(cs: ChunkRecord[]) {
    for (const c of cs) await this.db.prepare('INSERT OR REPLACE INTO chunks (id,document_id,idx,text,heading,page,start_line,end_line,content_hash) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(c.id, c.documentId, c.index, c.text, c.heading ?? null, c.page ?? null, c.startLine ?? null, c.endLine ?? null, c.contentHash).run();
  }
  async getChunk(id: string) { const r = await this.db.prepare('SELECT * FROM chunks WHERE id=?').bind(id).first(); return r ? this.rowToChunk(r) : undefined; }
  async getChunks(ids: string[]) { const out: ChunkRecord[] = []; for (const id of ids) { const c = await this.getChunk(id); if (c) out.push(c); } return out; }
  async chunksForDocument(documentId: string) { const { results } = await this.db.prepare('SELECT * FROM chunks WHERE document_id=? ORDER BY idx').bind(documentId).all(); return (results ?? []).map((r: any) => this.rowToChunk(r)); }
  async deleteChunksForDocument(documentId: string) { await this.db.prepare('DELETE FROM chunks WHERE document_id=?').bind(documentId).run(); }
  async findDocumentBySourceRef(ref: string) { const r = await this.db.prepare('SELECT * FROM documents WHERE source_ref=?').bind(ref).first(); return r ? this.rowToDoc(r) : undefined; }
  async putSyncRun(r: SyncRun) {
    await this.db.prepare('INSERT OR REPLACE INTO sync_runs (id,repo,branch,started_at,finished_at,added,updated,skipped,deleted,failed,errors,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(r.id, r.repo, r.branch, r.startedAt, r.finishedAt ?? null, r.added, r.updated, r.skipped, r.deleted, r.failed, JSON.stringify(r.errors), r.status).run();
  }
  async listSyncRuns(limit = 20) {
    const { results } = await this.db.prepare('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?').bind(limit).all();
    return (results ?? []).map((r: any) => ({ id: r.id, repo: r.repo, branch: r.branch, startedAt: r.started_at, finishedAt: r.finished_at ?? undefined, added: r.added, updated: r.updated, skipped: r.skipped, deleted: r.deleted, failed: r.failed, errors: JSON.parse(r.errors ?? '[]'), status: r.status }));
  }
  async logProviderAttempt(a: ProviderAttempt & { at: string }) {
    await this.db.prepare('INSERT INTO provider_attempts (provider,model,ok,latency_ms,error_category,at) VALUES (?,?,?,?,?,?)')
      .bind(a.provider, a.model, a.ok ? 1 : 0, a.latencyMs, a.errorCategory ?? null, a.at).run();
  }
  async recentProviderAttempts(limit = 20) {
    const { results } = await this.db.prepare('SELECT * FROM provider_attempts ORDER BY id DESC LIMIT ?').bind(limit).all();
    return (results ?? []).map((r: any) => ({ provider: r.provider, model: r.model, ok: !!r.ok, latencyMs: r.latency_ms, errorCategory: r.error_category ?? undefined, at: r.at }));
  }
  async logQuery(q: QueryLogEntry) {
    await this.db.prepare('INSERT INTO query_log (id,question,provider,retrieval_ms,generation_ms,total_ms,insufficient,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(q.id, q.question, q.provider, q.retrievalMs, q.generationMs, q.totalMs, q.insufficientEvidence ? 1 : 0, q.createdAt).run();
  }
  async recentQueries(limit = 50) {
    const { results } = await this.db.prepare('SELECT * FROM query_log ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return (results ?? []).map((r: any) => ({ id: r.id, question: r.question, provider: r.provider, retrievalMs: r.retrieval_ms, generationMs: r.generation_ms, totalMs: r.total_ms, insufficientEvidence: !!r.insufficient, createdAt: r.created_at }));
  }
  async putEvalSummary(s: unknown) { await this.db.prepare('INSERT OR REPLACE INTO kv_store (key,value) VALUES (?,?)').bind('eval_summary', JSON.stringify(s)).run(); }
  async getEvalSummary() { const r = await this.db.prepare('SELECT value FROM kv_store WHERE key=?').bind('eval_summary').first(); return r ? JSON.parse(r.value) : null; }
}
