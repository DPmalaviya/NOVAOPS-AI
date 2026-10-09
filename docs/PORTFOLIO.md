# Portfolio Outputs

## Project description

NovaOps AI is a production-shaped retrieval-augmented generation workspace built on free-tier infrastructure. Users upload documents or sync a public GitHub repository; NovaOps parses, chunks, embeds, and indexes them, then answers questions strictly from retrieved evidence with inspectable citations. Generation falls back across Gemini, Cloudflare Workers AI, and Ollama Cloud, and degrades to a retrieval-only response instead of failing. The system is evaluated with a 35-case dataset (Hit Rate@K, MRR, no-answer correctness) and benchmarked end to end, with all numbers produced by reproducible scripts in the repository.

## Resume bullets (only measured facts)

- Built a full RAG pipeline (parsing → structure-aware chunking → BGE embeddings → vector search → grounded generation → verified citations) as a TypeScript monorepo with React, Cloudflare Workers/D1/Vectorize, and Python evaluation tooling.
- Achieved 97.1% Hit Rate@5 and 0.889 MRR on a 35-case evaluation set (factual, cross-document, no-answer, adversarial, prompt-injection); calibrated the insufficient-evidence threshold from measured score distributions, fixing no-answer correctness from 0/5 to 5/5.
- Implemented idempotent incremental GitHub sync keyed by blob SHA — an unchanged re-sync performs zero content fetches and completes in ~7 ms locally versus 1,692 ms for a full 8-document index — plus a three-provider fallback router with bounded retries and a retrieval-only final fallback.
