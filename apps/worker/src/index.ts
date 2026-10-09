// Cloudflare Workers entry point. Bindings: DB (D1), VECTORIZE, AI.
// Secrets (GEMINI_API_KEY etc.) are set with `wrangler secret put`.
import { createApp } from './app.js';
import { buildDeps, type EnvLike } from './config.js';

let cached: ReturnType<typeof createApp> | null = null;
export default {
  async fetch(req: Request, env: EnvLike): Promise<Response> {
    if (!cached) cached = createApp(await buildDeps(env));
    return cached(req);
  },
};
