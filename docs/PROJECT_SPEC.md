# NovaOps AI — Project Specification

## Product

NovaOps AI is an AI knowledge and research workspace for a portfolio demonstration. A user adds documents, NovaOps indexes them, the user asks natural-language questions, NovaOps retrieves evidence, generates a grounded answer from that evidence, and exposes the citations for inspection.

Primary flow: **Add documents → Index → Ask → Retrieve evidence → Generate grounded answer → Inspect citations.**

## V1 scope (in)

- RAG chat with citations and an evidence panel
- Document upload: PDF, DOCX, TXT, Markdown, CSV
- Public GitHub repository sync (idempotent, incremental)
- Parsing, chunking, embeddings, vector retrieval
- Provider fallback: Gemini → Cloudflare Workers AI → Ollama Cloud → retrieval-only
- Research mode: one deterministic workflow producing a structured, cited brief
- Evaluation dataset (35 cases) and measured retrieval metrics
- Performance benchmarks (indexing, incremental sync, retrieval)
- System page showing only real, collected data

## V1 scope (out, documented as future work)

Google Drive / OneDrive / Gmail / Slack / Jira connectors, billing, multi-tenant RBAC, Kubernetes, Kafka, microservices, autonomous multi-agent systems, and large enterprise approval workflows.

## Design system — "Graphite & Steel"

Three palette concepts were compared:

1. **Warm graphite + deep steel blue (chosen).** Warm off-white canvas, graphite text, one restrained steel accent. Best long-session readability, strongest developer-tool credibility, and it evolves the prototype's existing direction instead of discarding it.
2. Cool slate + indigo. Rejected: drifts toward generic purple-AI aesthetics the product must avoid.
3. Ink + amber. Rejected: warm and distinctive, but reads more like a publishing tool than an AI engineering product.

The system is implemented as semantic tokens (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--success`, `--warning`, `--error`, focus and disabled states) in `apps/web/src/styles.css`. Both light and dark themes are token-complete. No gradients, glow, or glassmorphism. Typography: Manrope for display, Inter for UI text, system monospace for metadata.

Navigation is limited to four sections: Workspace, Documents, Research, System.

## Public-demo limits (configurable in `@novaops/shared`)

| Limit | Default |
|---|---|
| Max file size | 10 MB |
| Max files per anonymous session | 5 |
| Max question length | 2,000 chars |
| Max Top-K | 10 |
| Max context budget | 12,000 chars |
| Queries per minute per session | 60 |

## Truthfulness rules

No fake AI responses, fabricated citations, invented metrics, or simulated sync history anywhere in the product. The System page renders only data the API actually collected; before any query or evaluation runs, it says so. Demo data is allowed only when labeled — the seeded corpus is labeled `source: sample` everywhere it appears.

## Public data rule

The public deployment is a demonstration system. Only public or synthetic documents should be indexed, because free-tier AI providers may use free-tier content to improve their products (Gemini free tier states this explicitly).
