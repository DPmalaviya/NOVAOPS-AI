// Real evaluation run: indexes the sample corpus with the local BGE
// embedder, runs the evaluation dataset at several chunking configs and
// Top-K values, and writes measured results. Nothing is estimated.
// Usage: npm run eval [-- --embedder lexical]
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemoryStore, MemoryVectorStore, TransformersEmbedder, LexicalTestEmbedder,
  IngestionService, Retriever, evaluateRetrieval, CHUNK_PRESETS, type EvalCase,
} from '@novaops/rag';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const useLexical = process.argv.includes('lexical');
const embedder: any = useLexical ? new LexicalTestEmbedder() : new TransformersEmbedder();
const cases: EvalCase[] = JSON.parse(await readFile(join(root, 'data/evaluation/questions.json'), 'utf8'));
const sampleDir = join(root, 'data/sample');
const files = (await readdir(sampleDir)).sort();

interface RunResult { chunkPreset: string; topK: number; hitRateAtK: number; mrr: number; noAnswer: string; meanRetrievalMs: number; chunks: number; indexMs: number; }
const runs: RunResult[] = [];
let baseline: any = null;

for (const preset of ['small', 'medium', 'large'] as const) {
  const store = new MemoryStore(); const vectors = new MemoryVectorStore();
  const ingestion = new IngestionService(store, vectors, embedder, CHUNK_PRESETS[preset]);
  const t0 = Date.now();
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(join(sampleDir, f)));
    await ingestion.ingest({ filename: f, bytes, source: 'sample', sourceRef: `sample:${f}` });
  }
  const indexMs = Date.now() - t0;
  const chunkCount = await vectors.count();
  const retriever = new Retriever(store, vectors, embedder);
  for (const topK of [3, 5, 8]) {
    const summary = await evaluateRetrieval(retriever, cases, topK, 0.50);
    runs.push({ chunkPreset: preset, topK, hitRateAtK: summary.hitRateAtK, mrr: summary.meanReciprocalRank, noAnswer: `${summary.noAnswerCorrect}/${summary.noAnswerCases}`, meanRetrievalMs: summary.meanRetrievalMs, chunks: chunkCount, indexMs });
    if (preset === 'medium' && topK === 5) baseline = summary;
    console.log(`${preset} topK=${topK}: HitRate=${summary.hitRateAtK.toFixed(3)} MRR=${summary.meanReciprocalRank.toFixed(3)} noAnswer=${summary.noAnswerCorrect}/${summary.noAnswerCases} retrievalMs=${summary.meanRetrievalMs.toFixed(1)} chunks=${chunkCount} indexMs=${indexMs}`);
  }
}
const best = [...runs].sort((a, b) => b.hitRateAtK - a.hitRateAtK || b.mrr - a.mrr)[0];
const out = {
  generatedAt: new Date().toISOString(),
  embedder: `${embedder.provider}:${embedder.model} (${embedder.dimensions}d)`,
  dataset: 'data/evaluation/questions.json',
  corpus: files,
  runs, best, baseline,
};
await mkdir(join(root, 'data/evaluation/results'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await writeFile(join(root, `data/evaluation/results/eval-${useLexical ? 'lexical' : 'bge'}-${stamp}.json`), JSON.stringify(out, null, 2));
await writeFile(join(root, 'data/evaluation/results/latest.json'), JSON.stringify(out, null, 2));
console.log(`Best: ${best.chunkPreset} topK=${best.topK} HitRate=${best.hitRateAtK.toFixed(3)}`);
