# Architecture

## Implemented Stage 2 topology

```text
React/Vite → Worker API → Workers AI Qwen3 embeddings
                      ↓                        ↓
                  D1 metadata ← source IDs → Vectorize cosine search
                      ↑                        ↓
                      └──── retrieved chunk text / source citation
```

The Worker currently exposes `GET /api/health`, `POST /api/index-sample`, and `POST /api/retrieve`. Sample indexing hashes content, chunks text deterministically, embeds with `@cf/qwen/qwen3-embedding-0.6b`, upserts stable IDs to Vectorize, and writes matching source text/metadata to D1. Repeating an unchanged sample indexing call skips embeddings. Retrieval embeds the query, restricts search to the public sample namespace, and hydrates matching IDs from D1 before returning excerpts. This is retrieval-only: no generation occurs.

Cloudflare account resources created specifically for NovaOps: D1 `novaops-ai-metadata` (UUID `7ee285a3-076c-415a-88e4-be3be1ca86fd`) and Vectorize `novaops-ai-v1` (1,024 dimensions, cosine). The real Vectorize API v2 REST path returned “index not found”; v1/legacy REST endpoints worked. Worker binding methods remain the intended production access path and require a live Worker smoke test.

## Intended V1 topology

```text
Browser → Web app → Worker RAG orchestrator → query embedder → Vectorize adapter
                                  ↓                         ↓
                        D1 metadata / job state        Top-K evidence
                                  ↓                         ↓
Documents / public GitHub → parser → chunker → embedder → citations
                                                          ↓
                                             provider router → grounded answer
```

The Worker owns API validation, namespace checks, orchestration and structured telemetry. D1 stores metadata, document/source versions, chunk text, sync checkpoints, evaluation cases/results and redacted operational events. Vectorize is isolated behind its adapter.

## Processing boundary

Workers Free CPU is too constrained to assume reliable synchronous document extraction. Stage 4 will validate bounded, format-specific browser-worker extraction and server-side validation before exposing uploads. Large, malformed, encrypted or scanned PDF behavior must be explicit. A queue or batch mechanism will be adopted only if it is proven compatible with verified no-cost limits.

## Data isolation

The current source namespace is a single shared public sample namespace. Anonymous uploads and isolation are not implemented. Before uploads, every metadata lookup, vector query and deletion must filter by server-issued namespace; shared public sample content remains separate. Server credentials are never issued to the web app.
