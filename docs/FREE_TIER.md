# Free-tier architecture verification

**Verified:** October 8, 2026. Verify again immediately before enabling a service; published allowances and account eligibility can change.

| Service | Purpose | Current published free allowance | Expected NovaOps usage | Fallback / limitation |
|---|---|---|---|---|
| Cloudflare Workers | API and orchestration | 100,000 requests/day, 10 ms CPU/request, 128 MB memory | Lightweight validation, reads and provider orchestration | Do not perform heavy parsing synchronously; fail safely when unavailable. |
| Cloudflare D1 | Metadata and state | 5M rows read/day, 100k rows written/day, 5 GB total storage | Bounded documents, chunks, sync and evaluation metadata | Require indexed queries and cleanup; show storage/quota failure honestly. |
| Cloudflare Vectorize | Semantic vectors | 30M queried dimensions/month, 5M stored dimensions | Small shared corpus and strictly limited demo queries | Cap document/chunk/session volume; retrieval unavailable if quota is reached. |
| Cloudflare Workers AI | Secondary generation or embeddings after model verification | 10,000 neurons/day; model restrictions apply | Bounded fallback requests | Verify selected free-compatible model and dimensions first; provider router skips invalid/disabled configuration. |
| Cloudflare Queues | Bounded asynchronous work if verified necessary | 10,000 operations/day, 24-hour retention | Small indexing jobs only | Not assumed to solve CPU limits; synchronous validation remains required. |
| Cloudflare R2 | Not required for V1 foundation | 10 GB-month, 1M Class A, 10M Class B operations/month | Avoid as a required dependency until account activation/cost controls are verified | Prefer expiring derived content and document raw-file limitations. |
| Gemini Developer API | Primary generation | Free tier offers limited model access and free tokens; free-tier content may be used to improve products | Public/synthetic data only, strict limits | Verify project-specific active model RPM/TPM/RPD in AI Studio; evidence-only fallback after provider failure. |
| Ollama Cloud | Optional third generation fallback | Free plan includes starter credits, starter models and one concurrent request; nemotron-3-nano is listed as token-priced | Disabled by default until account entitlement and exact model/API are verified | Skip it when no verified no-charge access is configured; never route to local user hardware. |

## Source of record
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Ollama pricing](https://ollama.com/pricing)

No service is enabled, upgraded, billed, or represented as available merely because a free tier is published. Account-specific access, authentication, model IDs, SDK compatibility and live quota must be verified before activation.
