# NovaOps AI — Architecture

```text
User
  |
Web App (React + TypeScript, Cloudflare-hosted static build)
  |
API / RAG Orchestrator (TypeScript Worker, framework-free fetch handler)
  |
Query Embedding (same model as the index)
  |
Vector Search (Vectorize in production, in-memory locally)
  |
Top-K Evidence (hydrated from D1 / in-memory metadata store)
  |
Provider Router
  |-- Gemini (primary)
  |-- Cloudflare Workers AI (fallback)
  |-- Ollama Cloud (fallback)
  |
Grounded Answer -> Citation Mapping -> User
  |
Retrieval-only response if every provider fails
```

```text
Documents / Public GitHub
  |
Parser (PDF pages, DOCX, Markdown headings, CSV rows, TXT)
  |
Chunker (structure-aware, token-budgeted, overlapping)
  |
Embeddings (Workers AI bge-base in production, BGE-small local)
  |
Vectorize (vectors) + D1 (document/chunk metadata, sync runs, logs)
```

## Modules

| Module | Responsibility |
|---|---|
| `packages/rag/src/parser.ts` | Format parsing with honest metadata (pages/headings/lines/rows) |
| `packages/rag/src/chunker.ts` | Structure-aware recursive chunking, configurable size/overlap |
| `packages/rag/src/embedder.ts` | Embedding provider interface + Workers AI / Gemini / local BGE |
| `packages/rag/src/vectorstore.ts` | Vector store interface + Vectorize / in-memory |
| `packages/rag/src/store.ts` | Metadata store interface + D1 / in-memory |
| `packages/rag/src/ingest.ts` | Parse→chunk→embed→index, content-hash change detection |
| `packages/rag/src/retriever.ts` | Query embedding, Top-K search, evidence hydration |
| `packages/rag/src/prompt.ts` | Grounded prompt construction, evidence fencing |
| `packages/rag/src/providers.ts` | Gemini / Workers AI / Ollama Cloud clients, error classification |
| `packages/rag/src/router.ts` | Ordered fallback, bounded retries, backoff |
| `packages/rag/src/citations.ts` | Citation extraction and verification against evidence |
| `packages/rag/src/query.ts` | Query service incl. insufficient-evidence and retrieval-only paths |
| `packages/rag/src/research.ts` | Research workflow (deterministic state machine) |
| `packages/rag/src/github.ts` | Public GitHub sync (blob-SHA identity, deletions, idempotency) |
| `packages/rag/src/ratelimit.ts` | Per-session query rate limit and upload budget |
| `packages/rag/src/evaluate.ts` | Hit Rate@K, MRR, no-answer correctness |

## Why no agent framework

Research mode is a fixed pipeline: interpret → retrieve → select → generate → verify. Its steps are deterministic, its inputs and outputs are known, and nothing about it benefits from autonomous planning. A state machine is easier to test, cheaper to run, and easier to explain than LangGraph or a multi-agent setup, so NovaOps uses plain functions and records each step from real operations. Agent orchestration would be reconsidered only if a workflow needed open-ended tool choice.

## Storage split

- **D1** — document metadata, chunk text/metadata, sync runs, provider attempt log, query log, evaluation summary.
- **Vectorize** — embeddings and semantic search; chunk/document IDs ride in vector metadata.
- **No object storage in V1** — uploaded bytes are processed in-memory and not persisted as files; only extracted text (chunks) is stored. This keeps the free tier simple and avoids a storage bill. Consequence: re-indexing an uploaded document requires re-uploading it (the API says so explicitly); GitHub documents re-index via sync.

## Runtime split

The same fetch-handler app (`apps/worker/src/app.ts`) runs on Cloudflare Workers (D1 + Vectorize + AI bindings) and locally on Node (in-memory stores + local BGE embeddings), which keeps local development and tests honest without a second API implementation. Python is used where it is genuinely useful: HTTP-level evaluation and benchmarks (`python/evaluation`, `python/benchmarks`) and bulk ingestion (`python/ingestion`).
