# NovaOps AI

NovaOps AI is a free-first, evidence-led RAG knowledge workspace built as an AI engineering portfolio project. Its intended flow is straightforward: add public or synthetic documents, index them, retrieve evidence, generate a grounded answer, and inspect the cited source passages.

> **Current status: Stage 1 — foundation.** The old static prototype is preserved in `prototype/`. The new React app deliberately presents only live foundation states: the API health check and an honest empty workspace. Upload, sync, retrieval, generation, research, metrics, and provider status are not yet implemented and are not represented as live features.

## Planned architecture

```text
Documents / public GitHub
          ↓
 Parser → Chunker → Embeddings → Vector store
                              ↓
Web app → Worker API → Query embedding → Top-K evidence
                                           ↓
                              Provider router → Grounded answer → Citations
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/RAG_DESIGN.md](docs/RAG_DESIGN.md), [docs/FREE_TIER.md](docs/FREE_TIER.md), and [BUILD_STATUS.md](BUILD_STATUS.md) for the current verified scope and limitations.

## Local development

Requirements: Node 20+ and npm.

```bash
npm install
npm run dev
npm run dev:worker
```

The web app runs through Vite. The Worker health endpoint is available through Wrangler locally after dependencies are installed.

```bash
npm run typecheck
npm run test
npm run build
```

## Security posture

The public deployment will accept **public, synthetic, or otherwise non-sensitive** content only. No API keys belong in frontend code, repository files, issue content, or logs. Before enabling each provider or storage service, verify its current pricing, account requirements, and actual configured limits. See [docs/SECURITY.md](docs/SECURITY.md).

## License

Not yet selected.
