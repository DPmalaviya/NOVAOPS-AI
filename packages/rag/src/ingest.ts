// Ingestion: parse -> chunk -> embed -> index. Content-hash based change
// detection makes re-ingestion of unchanged content a no-op.
import type { ChunkRecord, DocumentRecord, SourceKind } from '@novaops/shared';
import { parseDocument } from './parser.js';
import { chunkSections, CHUNK_PRESETS, type ChunkConfig } from './chunker.js';
import { sha256Hex, chunkIdFor } from './hash.js';
import type { Embedder } from './embedder.js';
import type { VectorStore } from './vectorstore.js';
import { VectorizeStore } from './vectorstore.js';
import type { MetadataStore } from './store.js';

export interface IngestInput {
  filename: string;
  bytes: Uint8Array;
  source: SourceKind;
  sourceRef?: string;
  sourceVersion?: string;
  mime?: string;
}

export interface IngestResult {
  document: DocumentRecord;
  skipped: boolean;
  chunkCount: number;
  timings: { parseMs: number; chunkMs: number; embedMs: number; indexMs: number; totalMs: number };
  warnings: string[];
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class IngestionService {
  constructor(
    private store: MetadataStore,
    private vectors: VectorStore,
    private embedder: Embedder,
    private chunkConfig: ChunkConfig = CHUNK_PRESETS.medium,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const t0 = Date.now();
    const contentHash = await sha256Hex(input.bytes);
    // Change detection: same source identity + same content => skip all work.
    const existing = input.sourceRef ? await this.store.findDocumentBySourceRef(input.sourceRef) : undefined;
    if (existing && existing.contentHash === contentHash && existing.state === 'ready') {
      return { document: existing, skipped: true, chunkCount: existing.chunkCount,
        timings: { parseMs: 0, chunkMs: 0, embedMs: 0, indexMs: 0, totalMs: Date.now() - t0 }, warnings: [] };
    }
    const docId = existing?.id ?? newId('doc');
    const doc: DocumentRecord = {
      id: docId, filename: input.filename, source: input.source, sourceRef: input.sourceRef,
      sourceVersion: input.sourceVersion, mime: input.mime ?? '', sizeBytes: input.bytes.byteLength,
      state: 'processing', chunkCount: 0, contentHash,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await this.store.putDocument(doc);
    try {
      const tp = Date.now();
      const parsed = await parseDocument(input.filename, input.bytes);
      const parseMs = Date.now() - tp;
      const tc = Date.now();
      const drafts = chunkSections(parsed.sections, this.chunkConfig);
      const chunkMs = Date.now() - tc;
      if (!drafts.length) throw new Error('No extractable text found in document');
      const chunks: ChunkRecord[] = [];
      for (const d of drafts) {
        chunks.push({
          id: chunkIdFor(docId, d.index), documentId: docId, index: d.index, text: d.text,
          heading: d.heading, page: d.page, startLine: d.startLine, endLine: d.endLine,
          contentHash: await sha256Hex(d.text),
        });
      }
      const te = Date.now();
      const embeddings = await this.embedder.embed(chunks.map((c) => c.text));
      const embedMs = Date.now() - te;
      if (embeddings.length !== chunks.length) throw new Error('Embedder returned a mismatched batch');
      const ti = Date.now();
      // Replace prior version atomically-ish: remove old vectors/chunks first.
      await this.removeVectors(docId, existing?.chunkCount ?? 0);
      await this.store.deleteChunksForDocument(docId);
      await this.vectors.upsert(chunks.map((c, i) => ({ id: c.id, values: embeddings[i], chunkId: c.id, documentId: docId })));
      await this.store.putChunks(chunks);
      const indexMs = Date.now() - ti;
      doc.state = 'ready'; doc.chunkCount = chunks.length; doc.indexedAt = new Date().toISOString(); doc.error = undefined;
      await this.store.putDocument(doc);
      return { document: doc, skipped: false, chunkCount: chunks.length,
        timings: { parseMs, chunkMs, embedMs, indexMs, totalMs: Date.now() - t0 }, warnings: parsed.warnings };
    } catch (err) {
      doc.state = 'failed'; doc.error = err instanceof Error ? err.message : String(err);
      await this.store.putDocument(doc);
      throw err;
    }
  }

  private async removeVectors(documentId: string, knownChunkCount: number): Promise<void> {
    if (this.vectors instanceof VectorizeStore) {
      const chunks = await this.store.chunksForDocument(documentId);
      const ids = chunks.length ? chunks.map((c) => c.id)
        : Array.from({ length: knownChunkCount }, (_, i) => chunkIdFor(documentId, i));
      if (ids.length) await this.vectors.deleteByIds(ids);
    } else {
      await this.vectors.deleteByDocument(documentId);
    }
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const doc = await this.store.getDocument(documentId);
    if (!doc) return false;
    await this.removeVectors(documentId, doc.chunkCount);
    await this.store.deleteChunksForDocument(documentId);
    await this.store.deleteDocument(documentId);
    return true;
  }
}
