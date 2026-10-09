# Evaluation

Dataset: `data/evaluation/questions.json` — 35 hand-written cases over the bundled sample corpus (8 documents): 20 factual, 3 cross-document, 5 no-answer, 2 confusion, 2 ambiguous, 1 adversarial, 2 prompt-injection. Each case names the expected source document (or `null` for no-answer). Injection cases name the policy document that *should* be retrieved (secrets/injection handling); whether the model refuses is a generation-layer property checked separately.

Reproduce: `npm run eval` (TypeScript, in-process) or start the local server and run `python3 python/evaluation/run_evaluation.py` (HTTP-level, independent implementation). Raw results land in `data/evaluation/results/`.

## Measured results — 2026-10-08, local BGE-small (384d), sample corpus

| Configuration | Hit Rate@K | MRR | No-answer correct | Mean retrieval |
|---|---|---|---|---|
| chunk small (250/25), Top-K 3 | 0.971 | 0.889 | 5/5 | 12.5 ms |
| chunk medium (500/50), Top-K 5 (baseline) | 0.971 | 0.889 | 5/5 | 11.0 ms |
| chunk large (800/80), Top-K 5 | 0.971 | 0.889 | 5/5 | 11.7 ms |

Python HTTP evaluation (Top-K 5) independently reproduced: Hit Rate 0.967 (rounded 29/30 answerable), MRR 0.889, no-answer 5/5, mean round trip 21.6 ms.

Per-category (baseline): factual 0.95 (19/20), cross-document 1.00, no-answer 1.00, confusion 1.00, ambiguous 1.00, adversarial 1.00, injection 1.00.

## Findings that changed the product

1. **Threshold calibration mattered more than chunking.** With the initial 0.30 cosine threshold, no-answer correctness was 0/5 — unrelated questions still score 0.35–0.44 with BGE-small, while the weakest answerable question scored 0.525. Calibrating the insufficient-evidence threshold to 0.50 fixed no-answer behavior without losing a single answerable case. This is now `minTopScore` in the query/research services.
2. **Chunk presets are indistinguishable on this corpus.** Every sample document's sections are shorter than 250 tokens, so small/medium/large produce the identical 23 chunks. The comparison is therefore inconclusive *for this corpus* — claiming a winner would be fabrication. The default stays **medium (500/50)** because production documents (long PDFs) need headroom, and Top-K stays **5** (equal hit rate to 3, better cross-document context). Re-run the comparison on a larger corpus before changing these.
3. **One genuine retrieval miss:** "How many generation providers are there?" retrieves provider-routing.md instead of the metrics CSV that records the count. Ranked retrieval prefers the prose document; the CSV is indexed as a single chunk with the header repeated. Documented, not hidden.

## Answer-quality checks

- Citation correctness: citations are emitted only for markers that map to real retrieved chunks (unit-tested); unverifiable markers are stripped from answer text.
- Grounded-answer success and unsupported-claim rate require a live generation provider and are evaluated manually per release; without provider keys the system returns retrieval-only responses, which cannot hallucinate.
- Generation latency is provider-dependent and is recorded per query in the System page when providers are configured.

## Performance (measured, local CPU, BGE-small)

From `npm run bench` (raw file: `data/evaluation/results/benchmark-latest.json`):

| Metric | Value |
|---|---|
| Full index: 8 documents → 23 chunks | 1,692 ms (~816 chunks/min incl. embedding) |
| Incremental re-index (unchanged) | 7 ms, 8/8 files skipped |
| Retrieval latency (in-process) | median 7 ms, max 27 ms (15 samples) |
| Retrieval round trip over HTTP | median 10 ms (`python/benchmarks/benchmark.py`) |

Cold-start note: the first index in a fresh process includes ~3 s of ONNX model loading (63 s on the very first ever run, which also downloads the model). Warm numbers above exclude model download but include runtime load where applicable. Generation latency is not benchmarked here because no provider keys are configured in this environment — the router records real per-attempt latency in the System page once keys exist.
