# NovaOps AI

An AI knowledge and research workspace: add documents, index them, ask questions, and get answers grounded in retrieved evidence — with citations you can inspect.

**Live demo:** deployment requires the owner's Cloudflare account and API keys (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Run it locally in two commands (below) — no accounts or keys needed for retrieval and evidence; add a Gemini key to enable generated answers.

## What it does

1. **Add documents** — upload PDF, DOCX, TXT, Markdown, or CSV, or sync a public GitHub repository.
2. **Index** — parse (preserving pages, headings, line ranges), chunk with a structure-aware strategy, embed, and store vectors + metadata.
3. **Ask** — the question is embedded and matched against the index.
4. **Retrieve evidence** — Top-K chunks with scores and full source metadata, shown in an evidence panel.
5. **Generate a grounded answer** — the model may only use the retrieved evidence and must cite it; below a measured confidence threshold, NovaOps says the evidence is insufficient instead of guessing.
6. **Inspect citations** — every citation marker is verified against a real retrieved chunk before it is shown.

## Architecture

```text
User → Web App → API / RAG Orchestrator → Query Embedding → Vector Search
     → Top-K Evidence → Provider Router (Gemini → Workers AI → Ollama Cloud)
     → Grounded Answer → Citation Mapping → User
     (all providers down → retrieval-only evidence response)

Documents / GitHub → Parser → Chunker → Embeddings → Vectorize + D1
```

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · RAG design: [docs/RAG_DESIGN.md](docs/RAG_DESIGN.md)

## Provider fallback

| Order | Provider | Role |
|---|---|---|
| 1 | Gemini (`gemini-2.5-flash`, configurable) | Primary generation |
| 2 | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8-fast`) | Fallback generation + production embeddings (BGE-base) |
| 3 | Ollama Cloud (`nemotron-3-nano`, configurable) | Second fallback |
| 4 | Retrieval-only | Evidence + citations with an explanation; never a fabricated answer |

The router classifies errors (timeout, rate limit, quota, auth, invalid model, malformed, unavailable), retries only retryable ones once with backoff, and logs every attempt to the System page.

## Measured results (not marketing)

Evaluation on the bundled 35-case dataset (factual, cross-document, no-answer, confusion, ambiguous, adversarial, prompt-injection) over the sample corpus, local BGE-small embeddings — reproduce with `npm run eval` or the Python runner:

- **Hit Rate@5: 0.971** · **MRR: 0.889** · **No-answer correctness: 5/5** (after calibrating the evidence threshold from measured score distributions; it was 0/5 before — see [docs/EVALUATION.md](docs/EVALUATION.md))
- Full index of 8 documents (23 chunks): **1,692 ms** local CPU; unchanged re-index: **7 ms** (8/8 files skipped by content hash)
- Retrieval latency: **~7 ms median** in-process, ~10 ms over HTTP

## Tech stack

React + TypeScript + Vite (web) · TypeScript Worker, framework-free fetch handler (API) · Cloudflare D1 + Vectorize + Workers AI (production) / in-memory stores + local BGE via ONNX (development) · Python for HTTP-level evaluation, benchmarks, and bulk ingestion · GitHub Actions CI (typecheck, tests, build).

## Local setup

```bash
npm install
npm run dev:api    # http://localhost:8787 — seeds the sample corpus, local embeddings
npm run dev:web    # http://localhost:5173
npm test           # 23 unit/integration tests
npm run eval       # evaluation across chunk presets and Top-K
npm run bench      # indexing / incremental / retrieval benchmarks
```

Optional keys go in `.env` (see `.env.example`): `GEMINI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, `OLLAMA_API_KEY`, `GITHUB_TOKEN`.

## Repository layout

```text
apps/web        React workspace (Workspace, Documents, Research, System)
apps/worker     API: Cloudflare entry + local Node server (same app code)
packages/rag    parser, chunker, embedder, vector store, retriever, prompt,
                providers, router, citations, research, GitHub sync, evaluation
packages/shared types and limits
python/         evaluation, benchmarks, bulk ingestion (against the HTTP API)
data/sample     bundled synthetic corpus (labeled source: sample)
data/evaluation 35-case dataset + measured results
docs/           spec, architecture, RAG design, free tier, evaluation,
                security, limitations, deployment, portfolio, interview prep
tests/          vitest suite
```

## Free-tier design

Normal demo usage costs $0: Workers free (100k req/day), D1 free, Vectorize free, Workers AI free allocation (10,000 Neurons/day), Gemini free tier, Ollama Cloud free starter credits. Verified figures and fallbacks: [docs/FREE_TIER.md](docs/FREE_TIER.md). If a quota runs out, NovaOps degrades to the next provider or to retrieval-only — it never upgrades anything automatically.

## Security and limitations

Server-side keys only, upload allowlist + size/session limits, per-session rate limiting, prompt-injection defenses (documents are fenced as untrusted data), sanitized error responses, security headers. Honest limits — no persisted upload bytes, no OCR for scanned PDFs, DOCX fidelity, free-tier ceilings — are listed in [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Why no multi-agent framework?

Research mode is a fixed pipeline (interpret → retrieve → select → generate → verify). A deterministic state machine is testable, cheap, and explainable; agent orchestration would add cost and opacity without improving the outcome. The steps shown in the UI are recorded from real operations, not simulated.
