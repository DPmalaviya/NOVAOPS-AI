# Free-Tier Architecture — Verified 2026-10-08

All figures below were checked against official provider documentation/pricing pages on 2026-10-08. Free tiers change; re-verify before relying on them. Normal portfolio-demo usage is designed to cost **$0** — no service below requires a paid plan for the demo, and NovaOps never enables billing or upgrades automatically.

| Service | Purpose | Free allowance (verified) | NovaOps expected usage | Fallback | Limitations |
|---|---|---|---|---|---|
| Cloudflare Workers | API hosting | 100,000 requests/day; 10 ms CPU/invocation; static assets free and unlimited | A few hundred requests/day for a portfolio demo | None needed at demo scale | 10 ms CPU means heavy parsing must stay light (text formats) or batched |
| Cloudflare D1 | Metadata, chunks, sync runs, logs | 5M rows read/day; 100K rows written/day; 5 GB total storage | Thousands of rows | Reduce logging retention | Row-based accounting: full scans count against reads |
| Cloudflare Vectorize | Vector index + search | 30M queried vector dimensions/month; 5M stored vector dimensions; max 1536 dims/vector; Top-K ≤ 50 with metadata; 100 indexes (free) | 768d vectors: ~6,500 stored vectors max on free storage; demo corpus is a few hundred | Smaller embedding model (384d) doubles headroom | Deletes are by vector ID (the app tracks chunk IDs in D1) |
| Cloudflare Workers AI | Fallback generation + production embeddings | 10,000 Neurons/day | BGE-base embeddings ≈ 6,058 Neurons per 1M input tokens; Llama 3.1 8B fp8-fast generation ≈ 4,119 in / 34,868 out Neurons per 1M tokens — a short grounded answer costs roughly 100–200 Neurons | Gemini primary; Ollama Cloud third; retrieval-only last | Free allocation is a hard stop (no paid overage on Workers Free) |
| Google Gemini API | Primary generation | Free tier with free input/output tokens for eligible models; exact per-model RPM/TPM/RPD are shown per-account in AI Studio and are not published as a static table (verified on the official rate-limits page) | One short generation per user question | Workers AI, then Ollama Cloud, then retrieval-only | Free-tier content may be used by Google to improve its products — public/synthetic data only. EEA/UK/CH free-tier availability has extra conditions |
| Ollama Cloud | Third generation provider | Free plan $0: starter usage credits for a starter set of models, 1 concurrent request; usage beyond starter credits is pay-as-you-go per token (`nemotron-3-nano`: $0.06 input / $0.24 output per 1M tokens) | Rare fallback calls only | Retrieval-only response | Starter credit amount is not published; treat Ollama Cloud as best-effort, never a primary dependency |
| GitHub API | Public repository sync | Unauthenticated REST: 60 requests/hour per IP; higher with a token (optional, free) | One tree request + one raw fetch per changed file per sync | Sync again later; unchanged files cost no content fetches | Public repositories only in V1 |
| GitHub Actions | CI | Public repositories: free | Lint/typecheck/test/build per push | None | — |
| Hugging Face (model download) | Local dev/eval embeddings | BGE-small ONNX model, free download, runs offline after first fetch | Local development and evaluation only | Workers AI embeddings when deployed | One-time ~130 MB model + ~380 MB runtime packages locally; not used in production |

## Cost posture

- No paid plan is required, enabled, or auto-upgraded anywhere in this project.
- If a free quota is exhausted, the designed behavior is degradation (next provider, then retrieval-only), never a charge.
- Secrets are provided by the operator via environment variables / `wrangler secret put`; the repository contains none.
