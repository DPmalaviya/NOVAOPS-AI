# Interview Preparation

## 30-second explanation

"I built NovaOps AI, a retrieval-augmented generation workspace. You add documents or sync a GitHub repo, it chunks and embeds them into a vector index, and when you ask a question it retrieves the top evidence and generates an answer grounded only in that evidence, with citations you can inspect. It runs entirely on free tiers — Cloudflare Workers, D1, and Vectorize, with Gemini as the primary model and two fallbacks — and I evaluated it properly: 35 test questions, hit rate, MRR, and no-answer behavior, all reproducible from scripts in the repo."

## 2-minute explanation

Problem: chatbots answer from memory and hallucinate; for document questions you need answers tied to sources. Architecture: an ingestion pipeline (parse → chunk → embed → index) and a query pipeline (embed question → vector search → Top-K evidence → prompt → generate → verify citations). Key decisions: one embedding model per index, recorded on the index; structure-aware chunking with measured preset comparison; a provider router that classifies errors — retry timeouts and rate limits once, never retry auth or bad model IDs, fall through Gemini → Workers AI → Ollama Cloud → retrieval-only evidence. Evaluation drove real changes: my first insufficient-evidence threshold failed every no-answer question because BGE scores for unrelated text sit around 0.4; measuring the score distribution and recalibrating fixed it. Deployment is Cloudflare free tier end-to-end, with app-level rate limits and upload caps protecting the demo.

## Deep-dive answers (short form)

- **Why RAG over fine-tuning?** The corpus changes (uploads, syncs); retrieval updates instantly, grounds answers in citable sources, and needs no training budget.
- **Chunking:** split on structure first (headings, pages, paragraphs), then pack sentences to a token budget with overlap. I compared 250/500/800-token presets; on my small corpus they tie, so I kept 500 and said why.
- **Embeddings:** BGE family; query and documents must share a model or cosine scores are meaningless. Model changes mean re-indexing.
- **Top-K:** 5 by default — measured equal hit rate to 3 and 8 on my set, with better cross-document coverage than 3.
- **Citations:** the model cites `[S#]` markers tied to prompt evidence blocks; after generation I verify each marker maps to a real chunk and strip unverifiable ones.
- **Hallucination control:** evidence-only prompt, confidence threshold with an explicit insufficient-evidence response, citation verification, retrieval-only fallback.
- **No-answer behavior:** if the top score is below the calibrated threshold, generation is never called.
- **Prompt injection:** documents are untrusted data, fenced in the prompt; the system prompt forbids following them; injection cases are in the eval set.
- **Incremental indexing:** content/blob-SHA identity — unchanged files skip parsing and embedding entirely; deletions propagate.
- **Provider fallback:** ordered router, error classification, bounded retry with backoff, quota moves to the next provider, final fallback returns evidence.
- **Rate limiting:** per-session query and upload limits at the app layer, plus provider quotas; exhaustion degrades instead of charging.
- **Latency:** local retrieval median ~7 ms in-process; generation dominates end-to-end and is recorded per attempt.
- **Evaluation:** Hit Rate@K, MRR, expected-source rank, no-answer correctness, per-category breakdowns, two independent runners (TS + Python over HTTP) that agree.
- **Scalability:** Vectorize/D1 quotas are the ceiling on free tier (~6,500 vectors at 768d); the store/vector interfaces isolate both, so scaling is a provider swap, not a rewrite.
- **Free-tier tradeoffs:** 10 ms Worker CPU, 10k Neurons/day, Gemini free-tier data-use terms — hence public/synthetic data only and honest degradation paths.
