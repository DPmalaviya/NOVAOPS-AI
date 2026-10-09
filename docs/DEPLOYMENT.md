# Deployment (Cloudflare, free tier)

Deployment needs the project owner's Cloudflare account and a Gemini API key — credentials are never committed and are set as Worker secrets.

## 1. Provision (one time)

```bash
cd apps/worker
npx wrangler login
npx wrangler d1 create novaops
npx wrangler vectorize create novaops-index --dimensions=768 --metric=cosine
```

Put the returned D1 `database_id` into `apps/worker/wrangler.toml`.

## 2. Secrets

```bash
npx wrangler secret put GEMINI_API_KEY      # primary generation
npx wrangler secret put OLLAMA_API_KEY      # optional third provider
npx wrangler secret put GITHUB_TOKEN        # optional, raises GitHub rate limit
```

Workers AI needs no key: it uses the `AI` binding in `wrangler.toml`.

## 3. Deploy the API

```bash
npx wrangler deploy
```

The Worker initializes D1 tables on first request. Verify: `GET https://<worker>/api/health` should report the workers-ai embedder and configured providers.

## 4. Deploy the web app

```bash
cd apps/web
# Point the static app at the Worker:
echo "VITE_API_BASE=https://<your-worker>.workers.dev" > .env.production
npm run build
npx wrangler pages deploy dist --project-name novaops-ai
```

## 5. Seed the demo corpus

Sync this repository itself (public) from the Documents page, or run the local server once and use the Python bulk-ingest tool against the deployed API.

## Local development (no accounts needed)

```bash
npm install
npm run dev:api    # http://localhost:8787 — local BGE embeddings, sample corpus seeded
npm run dev:web    # http://localhost:5173 — proxies /api to the local server
```

With no provider keys, generation returns retrieval-only responses by design. Add `GEMINI_API_KEY` (and optionally Cloudflare/Ollama credentials) to a local `.env` to enable live generation.
