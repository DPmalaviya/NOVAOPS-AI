CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, filename TEXT NOT NULL, source_type TEXT NOT NULL, content_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, indexed_at TEXT);
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, namespace TEXT NOT NULL, chunk_index INTEGER NOT NULL, text TEXT NOT NULL, source_label TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chunks_namespace_document ON chunks(namespace, document_id);
CREATE TABLE IF NOT EXISTS ingestion_runs (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, source_type TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, error_reason TEXT);
