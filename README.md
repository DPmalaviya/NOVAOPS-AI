# NovaOps AI

NovaOps AI is a free-first, evidence-led RAG knowledge workspace built as an AI engineering portfolio project. Its intended flow is straightforward: add public or synthetic documents, index them, retrieve evidence, generate a grounded answer, and inspect the cited source passages.

> **Current status: Stage 2 — retrieval foundation in progress.** The old static prototype is preserved in `prototype/`. The React workspace now supports indexing one built-in public synthetic sample and retrieving its evidence through Workers AI embeddings and Vectorize; it deliberately does not generate answers. Local route tests and Cloudflare resource-level inference/upsert/query checks have passed. Running the new Worker routes against deployed Cloudflare bindings remains to be verified. User uploads, GitHub sync, generation, research synthesis, telemetry, abuse controls, and public deployment are not yet implemented.

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

The web app runs through Vite. The Worker health endpoint is available through Wrangler locally after dependencies are installed. `/api/index-sample` indexes the included synthetic source and `/api/retrieve` returns matching source-backed passages. Configure real Cloudflare bindings in `apps/worker/wrangler.toml` only for the dedicated NovaOps resources; generation is intentionally absent.

```bash
npm run typecheck
npm run test
npm run build
```

## Security posture

The intended public deployment is limited to **public or synthetic** content. The current sample-only API has no user uploads and should not be exposed publicly until abuse controls, request limits, and live Worker route verification pass. No API keys belong in frontend code, repository files, issue content, or logs. Before enabling each provider or storage service, verify current pricing, account requirements, and actual configured limits. See [docs/SECURITY.md](docs/SECURITY.md) and [BUILD_STATUS.md](BUILD_STATUS.md).

## License

Not yet selected.
