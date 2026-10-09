# Build Status

Last updated: 2026-10-08. Statuses use only: NOT STARTED, IN PROGRESS, BLOCKED, FAILED, PASSED.
A stage is PASSED only with executed evidence, quoted below.

## Stage 1 — Repository audit + foundation: PASSED
- Audit: original repo was 4 files (index.html, app.js, styles.css, README.md). Simulated: chat answers (pattern-matched demo text), evidence scores (hard-coded 0.93/0.89/0.84), documents list, system metrics (92% Hit Rate, 1.8s — both labeled demo), research workflow steps, uploads (browser-only). All replaced by real implementations; prototype root files removed.
- Design system chosen: "Graphite & Steel" (see docs/PROJECT_SPEC.md) implemented as semantic tokens, light + dark.
- Free tiers verified against official docs on 2026-10-08 (docs/FREE_TIER.md).
- Evidence: `npm run build` succeeds (shared, rag, worker, web + Vite bundle). API health endpoint returns real configuration.

## Stage 2 — Retrieval without LLM: PASSED
- Parsers (MD/TXT/CSV native; PDF via unpdf with page numbers; DOCX paragraph extraction), structure-aware chunker, BGE embeddings, vector store interface (in-memory + Vectorize), D1/in-memory metadata stores, retrieval API.
- Evidence: unit tests for chunking/parsing/retrieval pass; live server returns expected source as top hit; evaluation harness (Stage 7) measures it.

## Stage 3 — Grounded generation: PASSED (code + tests; live provider calls BLOCKED on credentials)
- Provider interface + Gemini, Workers AI, Ollama Cloud clients; router with error classification and bounded retries; prompt builder with evidence fencing; citation verification; insufficient-evidence and retrieval-only paths.
- Evidence: router unit tests (fallback order, no retry on auth, retry-once on timeout, all-down => null result) and API tests (all-providers-down returns retrieval-only with evidence) pass. Live calls to Gemini/Workers AI/Ollama require the owner's API keys, which have not been provided; the local deployment therefore runs retrieval-only by design.

## Stage 4 — Document upload: PASSED
- Upload UI + API, base64 transport, allowlist/size/session-budget validation, parse→chunk→embed→index, status, delete.
- Evidence: live test — uploaded handbook.md indexed (state ready), then retrieved as top evidence (score 0.82) for a question about it. PDF and DOCX fixtures uploaded, indexed, and retrieved with correct page/heading metadata. Oversized file => HTTP 413; unsupported type => 415.

## Stage 5 — GitHub sync: PASSED
- Public repo sync via Git Trees API, blob-SHA identity, incremental skip, change updates, deletion removal, sync history.
- Evidence: mocked-tree unit test covers add/skip/update/delete. Live sync of DPmalaviya/NOVAOPS-AI: first sync added 1 file; second sync skipped 1, added 0 (no content re-fetched).

## Stage 6 — Research mode: PASSED
- Deterministic workflow (interpret → retrieve → select → generate brief → verify citations) with step details taken from real counts.
- Evidence: API test asserts steps and chunksSearched; service covered by the same router/citation tests.

## Stage 7 — Evaluation: PASSED
- 35-case dataset; TS runner + independent Python HTTP runner agree.
- Evidence: Hit Rate@5 = 0.971 (TS) / 0.967 (Python), MRR 0.889, no-answer 5/5 after threshold calibration (was 0/5 at 0.30). Full results in data/evaluation/results/ and docs/EVALUATION.md.

## Stage 8 — Performance: PASSED
- Evidence (local CPU, BGE-small): full index 8 docs/23 chunks in 1,692 ms (~816 chunks/min); incremental re-index 7 ms with 8/8 skipped; retrieval median 7 ms in-process, 10 ms HTTP round trip. Before/after: the "before" architecture re-embedded everything on every sync; content-hash skipping is the optimization and its effect is the 1,692 ms → 7 ms contrast. Details in docs/EVALUATION.md.

## Stage 9 — Security + reliability: PASSED
- Executed checks: unsupported file 415; oversized file 413; malformed PDF => clean 422 with no stack trace; oversized question 400; rate limit 429 after 60 requests/min; prompt-injection handled by evidence fencing + eval cases; provider outage => retrieval-only (unit + API tests); no-answer => insufficient evidence (live).
- Not executed live: Gemini timeout / Workers AI failure / Ollama failure against real endpoints — requires provider credentials (see Stage 3 note). Router behavior for those classes is covered by classified-error unit tests.

## Stage 10 — Portfolio release: IN PROGRESS (deployment BLOCKED on owner accounts)
- Done: production UI, responsive layout, README with real metrics, architecture diagram, docs set, portfolio description, resume bullets, interview prep (docs/PORTFOLIO.md, docs/INTERVIEW.md).
- Screenshots: pending the public URL — the automation browser runs remotely and cannot reach a localhost dev server (verified 2026-10-08); capture them from the deployed site.
- BLOCKED: public deployed URL requires the owner's Cloudflare account (Workers/D1/Vectorize provisioning + `wrangler deploy`) and a Gemini API key as a Worker secret. Step-by-step commands are in docs/DEPLOYMENT.md. Nothing in the code blocks deployment.
