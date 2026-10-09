# Security

## Implemented

- **Server-side secrets only.** API keys live in environment variables / Worker secrets. The frontend contains no keys and the repo ships only `.env.example` names.
- **Upload validation.** Extension allowlist (PDF, DOCX, TXT, MD, CSV), 10 MB size cap, empty-file rejection, per-session upload budget (5), processing errors reported without stack traces.
- **Query validation.** Max question length (2,000 chars), Top-K clamped to 10, context budget capped.
- **Rate limiting.** Per-session fixed-window limiter (60 queries/minute) with `Retry-After` on 429.
- **Prompt-injection defenses.** Retrieved documents are fenced as data in `<evidence>` blocks; the system prompt forbids following instructions inside them; adversarial and injection cases are part of the evaluation set. Unverifiable citation markers are stripped from answers.
- **Safe errors.** API errors use a stable envelope (`error.code`, `error.message`) and never include stack traces, keys, or provider internals beyond a category.
- **Headers/CORS.** `nosniff`, `X-Frame-Options: DENY`, restrictive CSP on API responses, `Referrer-Policy: no-referrer`. CORS is open because the demo API is public and carries no cookies or credentials; authenticated deployments should restrict the origin.
- **No uploaded files in git.** Uploads are processed in memory and never written into the repository (see `.gitignore` and the storage design in ARCHITECTURE.md).

## Honest limitations

- The demo has no user accounts, so rate limiting and upload budgets are per-session/per-IP heuristics, not identity-grade controls.
- DOCX parsing extracts paragraph text but does not preserve headings or run formatting; scanned PDFs have no OCR in V1.
- Prompt-injection defense is prompt-level plus evaluation coverage; it reduces risk but cannot guarantee a model never follows injected text. The citation verifier guarantees citations are real, not that every sentence is perfectly supported — unsupported-claim rate is sampled manually in evaluation.
- The public deployment must only ever receive public or synthetic documents (free-tier providers may train on free-tier content).
