# Architecture

## Stage 1 topology

```text
Browser → React/Vite web app → same-origin Cloudflare Worker API
                                      ↓
                               /api/health
```

This is the only live backend route at Stage 1. No D1, Vectorize, R2, Queue, provider credential, embedding or document data is provisioned yet.

## Intended V1 topology

```text
Browser → Web app → Worker RAG orchestrator → query embedder → Vectorize adapter
                                  ↓                         ↓
                        D1 metadata / job state        Top-K evidence
                                  ↓                         ↓
Documents / public GitHub → parser → chunker → embedder → normalized citations
                                                          ↓
                                             provider router → grounded answer
                                             Gemini → Workers AI → Ollama Cloud
                                             then evidence-only generation fallback
```

The Worker owns API validation, identity/namespace checks, rate limiting, orchestration, provider routing and structured telemetry. D1 stores metadata, document/source versions, chunk metadata, sync checkpoints, evaluation cases/results and redacted operational events. Vectorize is isolated behind `VectorStore`.

## Processing boundary
Workers Free CPU is too constrained to assume reliable synchronous document extraction. Stage 2–4 will validate bounded, format-specific browser-worker extraction and server-side validation before exposing upload. Large, malformed, encrypted or scanned PDF behavior must be explicit. A queue or batch mechanism will be adopted only if it is proven compatible with verified no-cost limits.

## Data isolation
Anonymous uploads receive a server-issued namespace. Every metadata lookup, vector query and deletion filters by that namespace. Shared public sample content uses a distinct namespace. Server credentials are never issued to the web app.
