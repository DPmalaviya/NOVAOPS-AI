# Free-tier architecture verification

**Verified:** October 8, 2026. Verify again immediately before enabling a service; published allowances and account eligibility can change.

| Service | Purpose | Current published free allowance | NovaOps use / observed state | Fallback / limitation |
|---|---|---|---|---|
| Cloudflare Workers | API and orchestration | 100,000 requests/day, 10 ms CPU/request, 128 MB memory | Worker compiles with D1, Vectorize and AI bindings; direct cloud function deployment is not yet smoke-tested | Do not perform heavy parsing synchronously; fail safely when unavailable. |
| Cloudflare D1 | Metadata and state | 5M rows read/day, 100k rows written/day, 5 GB total storage | Dedicated NovaOps metadata DB created; tables and sample document/chunk rows created and live queried | Require indexed queries and cleanup; show storage/quota failure honestly. |
| Cloudflare Vectorize | Semantic vectors | 30M queried dimensions/month, 5M stored dimensions | Dedicated 1,024-dimensional cosine index created; actual sample vector upserted, queried and hydrated through D1 | Cap document/chunk/session volume; retrieval unavailable if quota is reached. |
| Cloudflare Workers AI | Embeddings; later generation fallback | 10,000 neurons/day; model restrictions apply | Real `@cf/qwen/qwen3-embedding-0.6b` call returned a 1,024-dimensional vector without provider key | Recheck active limits. No local embedding fallback is represented as cloud retrieval. |
| Cloudflare Queues | Bounded asynchronous work if verified necessary | 10,000 operations/day, 24-hour retention | Not provisioned | Not assumed to solve CPU limits; synchronous validation remains required. |
| Cloudflare R2 | Not required for current sample | 10 GB-month, 1M Class A, 10M Class B operations/month | Not provisioned | Avoid as a required dependency until activation/cost controls are verified. |
| Gemini Developer API | Planned primary generation | Free tier offers limited model access/free tokens; free-tier content may be used to improve products | Not configured or called | Public/synthetic data only; verify project-specific limits in AI Studio. |
| Ollama Cloud | Optional future fallback | Free includes starter credits/starter models and one concurrent request; exact `nemotron-3-nano` free entitlement not established | Not configured or called | Disabled unless no-charge account access is verified. |

## Verified source references
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Qwen3 embedding model](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/)
- [Vectorize embedding tutorial](https://developers.cloudflare.com/vectorize/get-started/embeddings/)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Ollama pricing](https://ollama.com/pricing)

No service is enabled, upgraded, billed, or represented as available merely because a free tier is published. Account-specific access, authentication, model IDs, SDK compatibility and live quota must be verified before activation. Cloudflare's v2 Vectorize REST upsert/query endpoints returned “index not found” for the new index; the legacy REST endpoints succeeded. The Worker uses bindings rather than REST APIs; production compatibility remains a release check.
