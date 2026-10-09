// Performance benchmark against the in-process pipeline (no network).
// Reports real timings for indexing, incremental re-index, retrieval,
// and embedding throughput. Generation latency depends on live providers
// and is measured separately when keys are configured.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore, MemoryVectorStore, TransformersEmbedder, LexicalTestEmbedder, IngestionService, Retriever, CHUNK_PRESETS } from '@novaops/rag';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lexical = process.argv.includes('lexical');
const embedder: any = lexical ? new LexicalTestEmbedder() : new TransformersEmbedder();
const files = (await readdir(join(root, 'data/sample'))).sort();
const store = new MemoryStore(); const vectors = new MemoryVectorStore();
const ingestion = new IngestionService(store, vectors, embedder, CHUNK_PRESETS.medium);

let totalChunks = 0; const perFile: any[] = [];
const t0 = Date.now();
for (const f of files) {
  const bytes = new Uint8Array(await readFile(join(root, 'data/sample', f)));
  const r = await ingestion.ingest({ filename: f, bytes, source: 'sample', sourceRef: `sample:${f}` });
  totalChunks += r.chunkCount;
  perFile.push({ file: f, chunks: r.chunkCount, ...r.timings });
}
const fullIndexMs = Date.now() - t0;

// Incremental: re-ingest everything unchanged (should skip all work).
const t1 = Date.now();
let skipped = 0;
for (const f of files) {
  const bytes = new Uint8Array(await readFile(join(root, 'data/sample', f)));
  const r = await ingestion.ingest({ filename: f, bytes, source: 'sample', sourceRef: `sample:${f}` });
  if (r.skipped) skipped += 1;
}
const incrementalMs = Date.now() - t1;

const retriever = new Retriever(store, vectors, embedder);
const queries = ['How does provider fallback work?', 'How are unchanged files skipped?', 'How is retrieval quality measured?', 'What is the default chunking strategy?', 'How are API keys protected?'];
const lat: number[] = [];
for (let round = 0; round < 3; round++) for (const q of queries) { const r = await retriever.retrieve(q, 5); lat.push(r.retrievalMs); }
lat.sort((a, b) => a - b);
const bench = {
  generatedAt: new Date().toISOString(),
  embedder: `${embedder.provider}:${embedder.model} (${embedder.dimensions}d)`,
  documents: files.length, chunks: totalChunks,
  fullIndexMs, chunksPerMinute: Math.round(totalChunks / (fullIndexMs / 60000)),
  incrementalReindexMs: incrementalMs, incrementalSkipped: `${skipped}/${files.length}`,
  retrievalMs: { min: lat[0], median: lat[Math.floor(lat.length / 2)], max: lat[lat.length - 1], samples: lat.length },
  perFile,
};
await mkdir(join(root, 'data/evaluation/results'), { recursive: true });
await writeFile(join(root, 'data/evaluation/results/benchmark-latest.json'), JSON.stringify(bench, null, 2));
console.log(JSON.stringify(bench, null, 2));
