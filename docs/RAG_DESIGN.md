# NovaOps AI — RAG Design

## Pipeline

Question → validation (length, rate limit) → query embedding → vector search → metadata hydration → Top-K evidence → confidence threshold → prompt construction → provider router → grounded answer → citation verification → response.

## Chunking

Structure-aware recursive chunking: Markdown is split at headings, PDFs at pages, CSV at row blocks, everything at paragraph/sentence boundaries, packed to a token budget (chars/4 estimate) with overlap. Three presets are evaluated — small (250 tokens, 25 overlap), medium (500/50), large (800/80) — and the default is chosen from measured Hit Rate@K / MRR (see EVALUATION.md). Each chunk stores document ID, index, heading, page, line range, and a SHA-256 content hash.

## Embeddings

One embedding model per index; the index records provider, model, and dimensions, and queries always use the same model. Production: Workers AI `@cf/baai/bge-base-en-v1.5` (768d). Local development and evaluation: BGE-small (384d) via ONNX, fully offline. Gemini embeddings are available when configured. Changing the model requires a controlled re-index (delete + re-ingest), because vectors from different models are not comparable. Embeddings are requested in batches (50 for Workers AI, 16 locally).

## Retrieval

Semantic Top-K cosine search (default K=5, max 10). No BM25, hybrid search, or reranking in V1: they are added only if evaluation shows a measurable gain, and the retriever's shape leaves room for a rerank stage. Below a top-score threshold (0.30 cosine for BGE models), the system declares insufficient evidence instead of generating.

## Grounding and citations

The prompt instructs the model to answer only from fenced evidence blocks, cite every claim with `[S#]` markers, and refuse when evidence is insufficient. After generation, markers are verified: citations are emitted only for markers that map to real retrieved chunks, and unverifiable markers are stripped from the answer text.

## Failure design

Generation is layered over retrieval, never fused with it. Provider errors are classified (timeout, rate limit, quota, auth, invalid model, malformed, unavailable); only retryable classes get one bounded retry with backoff. If all providers fail, the response is the evidence itself with an explanation — the system degrades to a search engine rather than failing.
